import {
  canonicalizeParentCreateTaskInput,
  fingerprintParentCreateTaskPayload,
  parentCreateTaskWarnings,
} from "./createParentTaskCanonicalizer.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import {
  CreateTaskLedger,
  hashIdempotencyKey,
  type IdempotencyLedgerRecord,
} from "./createTaskLedger.js";
import type {
  CanonicalParentCreateTaskPayload,
  ParentCreatedTaskView,
  ParentCreateTaskInput,
  ParentCreateTaskSuccess,
} from "./createParentTaskSchemas.js";
import { verifyParentCreatedTask } from "./createParentTaskVerifier.js";
import {
  validateParentDestination,
  type ParentTaskFacts,
  type ParentTaskFactsRead,
} from "./parentDestination.js";
import type { CreateTaskUnderParentResult } from "../../tools/primitives/createTaskUnderParent.js";
import type { CreatedTaskVerificationReadResult } from "../../tools/primitives/readCreatedTaskForVerification.js";

export interface CreateParentTaskServiceDependencies {
  ledger: CreateTaskLedger;
  readParentTaskFactsById: (parentTaskId: string) => Promise<ParentTaskFactsRead>;
  createTaskUnderParent: (
    payload: CanonicalParentCreateTaskPayload,
  ) => Promise<CreateTaskUnderParentResult>;
  readCreatedTaskForVerification: (
    taskId: string,
  ) => Promise<CreatedTaskVerificationReadResult>;
  now?: () => Date;
}

export class CreateParentTaskService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CreateParentTaskServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(
    input: ParentCreateTaskInput,
    effectiveKey: string,
  ): Promise<ParentCreateTaskSuccess> {
    const canonical = canonicalizeParentCreateTaskInput(input);
    const payloadHash = fingerprintParentCreateTaskPayload(canonical);
    const keyHash = hashIdempotencyKey(effectiveKey);

    return this.dependencies.ledger.withGlobalLock(async () => {
      const record = await this.dependencies.ledger.reserve(keyHash, payloadHash);
      if (record.payloadHash !== payloadHash) {
        throw this.error(
          "idempotency_conflict",
          "The idempotency key is already bound to a different semantic payload.",
          {
            mayHaveWritten: ![
              "reserved",
              "retryable_validation_error",
              "terminal_prewrite_error",
            ].includes(record.state),
            taskId: record.taskId,
            idempotencyKey: effectiveKey,
          },
        );
      }
      if (record.state !== "reserved" && record.state !== "retryable_validation_error") {
        return this.handleExisting(record, canonical, effectiveKey);
      }

      const parentRead = await this.safeReadParentFacts(canonical.destination.parentTaskId);
      const parentValidation = validateParentDestination(
        canonical.destination.parentTaskId,
        parentRead,
      );
      if (!parentValidation.allowed) {
        await this.dependencies.ledger.transition(
          keyHash,
          parentValidation.retrySafe
            ? "retryable_validation_error"
            : "terminal_prewrite_error",
          { resultCode: `${parentValidation.code}.${parentValidation.reason}` },
        );
        throw this.error(
          parentValidation.code,
          "The requested ordinary Parent Task could not be validated for creation.",
          {
            mayHaveWritten: false,
            idempotencyKey: effectiveKey,
            reason: parentValidation.reason,
          },
          parentValidation.retrySafe,
        );
      }

      await this.dependencies.ledger.transition(keyHash, "write_started");
      let primitive: CreateTaskUnderParentResult;
      try {
        primitive = await this.dependencies.createTaskUnderParent(canonical);
      } catch (error) {
        await this.dependencies.ledger.transition(keyHash, "outcome_unknown", {
          resultCode: "verification_failed.outcome_unknown",
        });
        throw this.error(
          "verification_failed",
          "The Parent task creation process ended with an unknown outcome.",
          {
            mayHaveWritten: true,
            idempotencyKey: effectiveKey,
            reason: error instanceof CreateTaskOperationError
              ? error.detail.reason ?? "outcome_unknown"
              : "outcome_unknown",
          },
        );
      }

      if (!primitive.success) {
        if (primitive.phase === "prewrite") {
          return this.handlePrewriteFailure(keyHash, primitive, effectiveKey);
        }
        if (primitive.taskId) {
          await this.dependencies.ledger.transition(keyHash, "task_created", {
            taskId: primitive.taskId,
            resultCode: "postcreate_failure",
          });
          return this.verifyNewTask(
            keyHash,
            primitive.taskId,
            canonical,
            effectiveKey,
            parentValidation.facts,
          );
        }
        await this.dependencies.ledger.transition(keyHash, "outcome_unknown", {
          resultCode: "verification_failed.missing_task_id",
        });
        throw this.error(
          "verification_failed",
          "Parent task creation may have occurred, but no Task ID was returned.",
          {
            mayHaveWritten: true,
            idempotencyKey: effectiveKey,
            reason: "missing_task_id",
          },
        );
      }

      await this.dependencies.ledger.transition(keyHash, "task_created", {
        taskId: primitive.taskId,
      });
      return this.verifyNewTask(
        keyHash,
        primitive.taskId,
        canonical,
        effectiveKey,
        parentValidation.facts,
      );
    });
  }

  private async handlePrewriteFailure(
    keyHash: string,
    primitive: Extract<CreateTaskUnderParentResult, { success: false }>,
    effectiveKey: string,
  ): Promise<never> {
    const code = primitive.errorCategory === "unknown"
      || primitive.errorCategory === "postcreate_failure"
      ? "write_failed"
      : primitive.errorCategory;
    const retrySafe = isRetryablePrimitiveFailure(primitive);
    await this.dependencies.ledger.transition(
      keyHash,
      retrySafe ? "retryable_validation_error" : "terminal_prewrite_error",
      { resultCode: primitive.reason ? `${code}.${primitive.reason}` : code },
    );
    throw this.error(
      code,
      "The Parent task request failed before Task creation.",
      {
        mayHaveWritten: false,
        idempotencyKey: effectiveKey,
        reason: primitive.reason,
      },
      retrySafe,
    );
  }

  private async handleExisting(
    record: IdempotencyLedgerRecord,
    canonical: CanonicalParentCreateTaskPayload,
    effectiveKey: string,
  ): Promise<ParentCreateTaskSuccess> {
    if (record.state === "verified") {
      if (!record.taskId || !record.replayUntil) {
        throw this.error(
          "write_disabled",
          "The verified Parent idempotency tombstone is incomplete.",
          { mayHaveWritten: true },
        );
      }
      if (this.now().getTime() > Date.parse(record.replayUntil)) {
        throw this.error(
          "duplicate_request",
          "The Parent request was already used and its replay window has expired.",
          {
            mayHaveWritten: true,
            taskId: record.taskId,
            idempotencyKey: effectiveKey,
            reason: "replay_window_expired",
          },
        );
      }
      return this.replay(record, canonical, effectiveKey);
    }
    if (record.state === "task_created" || record.state === "verification_failed") {
      if (!record.taskId) {
        throw this.error(
          "write_disabled",
          "The Parent create_task tombstone is missing its Task ID.",
          { mayHaveWritten: true },
        );
      }
      return this.verifyNewTask(record.keyHash, record.taskId, canonical, effectiveKey);
    }
    const mayHaveWritten = record.state === "write_started" || record.state === "outcome_unknown";
    if (record.state === "write_started") {
      await this.dependencies.ledger.transition(record.keyHash, "outcome_unknown", {
        resultCode: "verification_failed.outcome_unknown",
      });
    }
    throw this.error(
      "duplicate_request",
      "The idempotency key has already been used and cannot execute another Parent write.",
      {
        mayHaveWritten,
        taskId: record.taskId,
        idempotencyKey: effectiveKey,
        reason: mayHaveWritten ? "outcome_unknown" : "prior_prewrite_attempt",
      },
    );
  }

  private async verifyNewTask(
    keyHash: string,
    taskId: string,
    canonical: CanonicalParentCreateTaskPayload,
    effectiveKey: string,
    prewriteFacts?: ParentTaskFacts,
  ): Promise<ParentCreateTaskSuccess> {
    const read = await this.dependencies.readCreatedTaskForVerification(taskId);
    if (!read.success) {
      await this.markVerificationFailed(keyHash, taskId, `verification_failed.${read.reason}`);
      throw this.error(
        "verification_failed",
        "The Parent child Task could not be read back exactly.",
        {
          mayHaveWritten: true,
          taskId,
          idempotencyKey: effectiveKey,
          reason: read.reason,
        },
      );
    }

    const currentParentRead = await this.safeReadParentFacts(
      canonical.destination.parentTaskId,
    );
    let parentFacts: ParentTaskFacts;
    let parentReadUnverified = false;
    if (currentParentRead.success) {
      parentFacts = currentParentRead.facts;
    } else if (prewriteFacts !== undefined) {
      parentFacts = factsForUnverifiedParent(prewriteFacts, read.value.task);
      parentReadUnverified = true;
    } else {
      await this.markVerificationFailed(
        keyHash,
        taskId,
        "verification_failed.current_parent_context_unavailable",
      );
      throw this.error(
        "verification_failed",
        "The created child exists, but its current Parent context is unavailable.",
        {
          mayHaveWritten: true,
          taskId,
          idempotencyKey: effectiveKey,
          reason: "current_parent_context_unavailable",
        },
      );
    }

    const verification = verifyParentCreatedTask(canonical, read.value, parentFacts);
    if (!verification.matches || verification.created === null) {
      await this.markVerificationFailed(keyHash, taskId, "partial_success");
      throw this.error(
        "partial_success",
        "The child exists, but its fields, ordinary Parent placement, Project context, or Tag set differs from the request.",
        {
          mayHaveWritten: true,
          taskId,
          idempotencyKey: effectiveKey,
          verificationDiff: verification.diff,
        },
      );
    }

    const warnings = parentCreateTaskWarnings(canonical);
    if (parentReadUnverified) {
      warnings.push({
        code: "parent_state_unverified_after_creation",
        message: "The child placement was verified, but the Parent's current eligibility could not be revalidated.",
      });
    } else {
      const validation = validateParentDestination(
        canonical.destination.parentTaskId,
        { success: true, facts: parentFacts },
      );
      if (!validation.allowed || parentContextChanged(prewriteFacts, parentFacts)) {
        warnings.push({
          code: "parent_state_changed_after_creation",
          message: "The child placement was verified, but the Parent context changed immediately after creation.",
        });
      }
    }

    const replayUntil = new Date(this.now().getTime() + 24 * 60 * 60 * 1_000).toISOString();
    const current = await this.dependencies.ledger.read(keyHash);
    if (current?.state === "task_created" || current?.state === "verification_failed") {
      await this.dependencies.ledger.transition(keyHash, "verified", {
        taskId,
        resultCode: "success",
        replayUntil,
      });
    }
    return {
      success: true,
      created: verification.created,
      idempotency: { key: effectiveKey, replayed: false, replayUntil },
      warnings,
    };
  }

  private async replay(
    record: IdempotencyLedgerRecord,
    canonical: CanonicalParentCreateTaskPayload,
    effectiveKey: string,
  ): Promise<ParentCreateTaskSuccess> {
    const read = await this.dependencies.readCreatedTaskForVerification(record.taskId!);
    if (!read.success) {
      throw this.error(
        "replay_target_unavailable",
        "The Parent replay target could not be read exactly.",
        {
          mayHaveWritten: true,
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
          reason: read.reason,
        },
      );
    }
    if (
      canonical.tagIds.length > 0
      && (
        read.value.tagIds.length < 1
        || read.value.tagIds.length > 5
        || new Set(read.value.tagIds).size !== read.value.tagIds.length
      )
    ) {
      throw this.replayContextUnavailable(record, effectiveKey, "current_tag_state_out_of_contract");
    }

    const current = await this.buildCurrentReplayView(read.value, canonical);
    if (!current.success) {
      throw this.replayContextUnavailable(record, effectiveKey, current.reason);
    }
    const warnings = parentCreateTaskWarnings(canonical);
    if (!current.matchesOriginal) {
      warnings.push({
        code: "replayed_current_state_changed",
        message: "The existing child Task or its current placement has changed since creation.",
      });
    }
    return {
      success: true,
      created: current.created,
      idempotency: {
        key: effectiveKey,
        replayed: true,
        replayUntil: record.replayUntil!,
      },
      warnings,
    };
  }

  private async buildCurrentReplayView(
    read: Extract<CreatedTaskVerificationReadResult, { success: true }>["value"],
    canonical: CanonicalParentCreateTaskPayload,
  ): Promise<
    | { success: true; created: ParentCreatedTaskView; matchesOriginal: boolean }
    | { success: false; reason: string }
  > {
    const { task } = read;
    const parentId = task.hierarchy.parentId;
    let location: ParentCreatedTaskView["location"];
    let parentFacts: ParentTaskFacts | null = null;

    if (task.location.inInbox && task.project === null && parentId === null) {
      location = { kind: "inbox" };
    } else if (
      !task.location.inInbox
      && task.project !== null
      && parentId === task.project.id
    ) {
      location = {
        kind: "project",
        projectId: task.project.id,
        projectName: task.project.name,
      };
    } else if (!task.location.inInbox && parentId !== null) {
      const parentRead = await this.safeReadParentFacts(parentId);
      if (!parentRead.success) {
        return { success: false, reason: "current_parent_context_unavailable" };
      }
      parentFacts = parentRead.facts;
      const projectId = parentFacts.project?.id ?? null;
      if ((task.project?.id ?? null) !== projectId) {
        return { success: false, reason: "current_parent_context_unavailable" };
      }
      location = {
        kind: "parentTask",
        parentTaskId: parentFacts.id,
        parentTaskName: parentFacts.name,
        projectId,
        projectName: parentFacts.project?.name ?? null,
      };
    } else {
      return { success: false, reason: "current_location_unrepresentable" };
    }

    const created = currentCreatedView(task, location, canonical, read.tagIds);
    if (created === null) {
      return { success: false, reason: "current_tag_state_out_of_contract" };
    }
    const placementMatches = location.kind === "parentTask"
      && location.parentTaskId === canonical.destination.parentTaskId;
    const validation = parentFacts === null
      ? null
      : validateParentDestination(parentFacts.id, { success: true, facts: parentFacts });
    const verification = parentFacts === null
      ? null
      : verifyParentCreatedTask(canonical, read, parentFacts);
    return {
      success: true,
      created,
      matchesOriginal: placementMatches
        && validation?.allowed === true
        && verification?.matches === true,
    };
  }

  private async safeReadParentFacts(parentTaskId: string): Promise<ParentTaskFactsRead> {
    try {
      return await this.dependencies.readParentTaskFactsById(parentTaskId);
    } catch {
      return { success: false, reason: "query_failed" };
    }
  }

  private async markVerificationFailed(
    keyHash: string,
    taskId: string,
    resultCode: string,
  ): Promise<void> {
    const current = await this.dependencies.ledger.read(keyHash);
    if (current?.state === "task_created") {
      await this.dependencies.ledger.transition(keyHash, "verification_failed", {
        taskId,
        resultCode,
      });
    }
  }

  private replayContextUnavailable(
    record: IdempotencyLedgerRecord,
    effectiveKey: string,
    reason: string,
  ): CreateTaskOperationError {
    return this.error(
      "replay_target_unavailable",
      "The replay target's current location cannot be represented safely.",
      {
        mayHaveWritten: true,
        taskId: record.taskId,
        idempotencyKey: effectiveKey,
        reason,
      },
    );
  }

  private error(
    code: ConstructorParameters<typeof CreateTaskOperationError>[0]["code"],
    message: string,
    detail: Omit<ConstructorParameters<typeof CreateTaskOperationError>[0], "code" | "message" | "retrySafe">,
    retrySafe = false,
  ): CreateTaskOperationError {
    return new CreateTaskOperationError({ code, message, retrySafe, ...detail });
  }
}

function isRetryablePrimitiveFailure(
  primitive: Extract<CreateTaskUnderParentResult, { success: false }>,
): boolean {
  if (
    primitive.errorCategory === "tag_not_found"
    || primitive.errorCategory === "tag_not_allowed"
    || primitive.errorCategory === "tag_validation_failed"
  ) return true;
  return primitive.errorCategory === "parent_validation_failed"
    && primitive.reason === "query_failed";
}

function factsForUnverifiedParent(
  prewrite: ParentTaskFacts,
  task: Extract<CreatedTaskVerificationReadResult, { success: true }>["value"]["task"],
): ParentTaskFacts {
  return {
    ...prewrite,
    project: task.project === null
      ? null
      : {
          id: task.project.id,
          name: task.project.name,
          status: "Active",
        },
    folderChain: [],
  };
}

function parentContextChanged(
  before: ParentTaskFacts | undefined,
  after: ParentTaskFacts,
): boolean {
  if (before === undefined) return false;
  return JSON.stringify({
    id: before.id,
    projectId: before.project?.id ?? null,
    projectStatus: before.project?.status ?? null,
    folderIds: before.folderChain.map(folder => folder.id),
    folderStatuses: before.folderChain.map(folder => folder.status),
  }) !== JSON.stringify({
    id: after.id,
    projectId: after.project?.id ?? null,
    projectStatus: after.project?.status ?? null,
    folderIds: after.folderChain.map(folder => folder.id),
    folderStatuses: after.folderChain.map(folder => folder.status),
  });
}

function currentCreatedView(
  task: Extract<CreatedTaskVerificationReadResult, { success: true }>["value"]["task"],
  location: ParentCreatedTaskView["location"],
  canonical: CanonicalParentCreateTaskPayload,
  currentTagIds: readonly string[],
): ParentCreatedTaskView | null {
  let tagIds: string[] | undefined;
  if (canonical.tagIds.length > 0) {
    if (
      currentTagIds.length < 1
      || currentTagIds.length > 5
      || new Set(currentTagIds).size !== currentTagIds.length
    ) return null;
    tagIds = [...currentTagIds].sort(compareCodeUnits);
  }
  return {
    id: task.id,
    name: task.name,
    note: task.note,
    location,
    plannedDate: normalizedInstant(task.dates.planned.direct),
    dueDate: normalizedInstant(task.dates.due.direct),
    deferDate: normalizedInstant(task.dates.defer.direct),
    flagged: task.status.flagged.direct,
    estimatedMinutes: task.estimate.minutes,
    ...(tagIds === undefined ? {} : { tagIds }),
  };
}

function normalizedInstant(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
