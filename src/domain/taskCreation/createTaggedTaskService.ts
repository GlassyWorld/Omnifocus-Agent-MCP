import {
  canonicalizeTaggedCreateTaskInput,
  createTaskWarnings,
  fingerprintTaggedCreateTaskPayload,
} from "./createTaskCanonicalizer.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import {
  CreateTaskLedger,
  hashIdempotencyKey,
  type IdempotencyLedgerRecord,
} from "./createTaskLedger.js";
import type { CreateTaskWarning } from "./createTaskSchemas.js";
import type {
  CanonicalTaggedCreateTaskPayload,
  TaggedCreateTaskInput,
  TaggedCreateTaskSuccess,
} from "./createTaskTagSchemas.js";
import { verifyTaggedCreatedTask } from "./createTaggedTaskVerifier.js";
import {
  validateProjectDestination,
  type ProjectDestinationResolution,
} from "./projectDestination.js";
import type { CreateTaggedTaskResult } from "../../tools/primitives/createTaggedTask.js";
import type { CreatedTaskVerificationReadResult } from "../../tools/primitives/readCreatedTaskForVerification.js";

export interface CreateTaggedTaskServiceDependencies {
  ledger: CreateTaskLedger;
  createTaggedTask: (
    payload: CanonicalTaggedCreateTaskPayload,
  ) => Promise<CreateTaggedTaskResult>;
  resolveProjectById: (projectId: string) => Promise<ProjectDestinationResolution>;
  readCreatedTaskForVerification: (
    taskId: string,
  ) => Promise<CreatedTaskVerificationReadResult>;
  now?: () => Date;
}

export class CreateTaggedTaskService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CreateTaggedTaskServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(
    input: TaggedCreateTaskInput,
    effectiveKey: string,
  ): Promise<TaggedCreateTaskSuccess> {
    const canonical = canonicalizeTaggedCreateTaskInput(input);
    const payloadHash = fingerprintTaggedCreateTaskPayload(canonical);
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

      if (canonical.destination.kind === "project") {
        const resolution = await this.safeResolveProjectById(canonical.destination.projectId);
        const validation = validateProjectDestination(canonical.destination.projectId, resolution);
        if (!validation.allowed) {
          await this.dependencies.ledger.transition(
            keyHash,
            validation.retrySafe ? "retryable_validation_error" : "terminal_prewrite_error",
            { resultCode: `${validation.code}.${validation.reason}` },
          );
          throw this.error(
            validation.code,
            "The requested Project destination could not be validated for tagged creation.",
            {
              mayHaveWritten: false,
              idempotencyKey: effectiveKey,
              reason: validation.reason,
            },
            validation.retrySafe,
          );
        }
      }

      await this.dependencies.ledger.transition(keyHash, "write_started");
      let primitive: CreateTaggedTaskResult;
      try {
        primitive = await this.dependencies.createTaggedTask(canonical);
      } catch (error) {
        await this.dependencies.ledger.transition(keyHash, "outcome_unknown", {
          resultCode: "verification_failed.outcome_unknown",
        });
        throw this.error(
          "verification_failed",
          "The tagged create operation ended with an unknown outcome.",
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
          return this.verifyNewTask(keyHash, primitive.taskId, canonical, effectiveKey);
        }
        await this.dependencies.ledger.transition(keyHash, "outcome_unknown", {
          resultCode: "verification_failed.missing_task_id",
        });
        throw this.error(
          "verification_failed",
          "Tagged task creation may have occurred, but no task ID was returned.",
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
      return this.verifyNewTask(keyHash, primitive.taskId, canonical, effectiveKey);
    });
  }

  private async handlePrewriteFailure(
    keyHash: string,
    primitive: Extract<CreateTaggedTaskResult, { success: false }>,
    effectiveKey: string,
  ): Promise<never> {
    const retrySafe = [
      "tag_not_found",
      "tag_not_allowed",
      "tag_validation_failed",
      "project_validation_failed",
    ].includes(primitive.errorCategory);
    const terminalCode = primitive.errorCategory === "unknown"
      || primitive.errorCategory === "postcreate_failure"
      ? "write_failed"
      : primitive.errorCategory;
    await this.dependencies.ledger.transition(
      keyHash,
      retrySafe ? "retryable_validation_error" : "terminal_prewrite_error",
      {
        resultCode: primitive.reason
          ? `${terminalCode}.${primitive.reason}`
          : terminalCode,
      },
    );
    throw this.error(
      terminalCode,
      "The tagged task request failed before Task creation.",
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
    canonical: CanonicalTaggedCreateTaskPayload,
    effectiveKey: string,
  ): Promise<TaggedCreateTaskSuccess> {
    if (record.state === "verified") {
      if (!record.taskId || !record.replayUntil) {
        throw this.error(
          "write_disabled",
          "The verified tagged idempotency tombstone is incomplete.",
          { mayHaveWritten: true },
        );
      }
      if (this.now().getTime() > Date.parse(record.replayUntil)) {
        throw this.error(
          "duplicate_request",
          "The tagged request was already used and its replay window has expired.",
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
          "The tagged create_task tombstone is missing its task ID.",
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
      "The idempotency key has already been used and cannot execute another tagged write.",
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
    canonical: CanonicalTaggedCreateTaskPayload,
    effectiveKey: string,
  ): Promise<TaggedCreateTaskSuccess> {
    const read = await this.dependencies.readCreatedTaskForVerification(taskId);
    if (!read.success) {
      const current = await this.dependencies.ledger.read(keyHash);
      if (current?.state === "task_created") {
        await this.dependencies.ledger.transition(keyHash, "verification_failed", {
          taskId,
          resultCode: `verification_failed.${read.reason}`,
        });
      }
      throw this.error(
        "verification_failed",
        "The tagged task could not be read back through the mutation verification boundary.",
        {
          mayHaveWritten: true,
          taskId,
          idempotencyKey: effectiveKey,
          reason: read.reason,
        },
      );
    }

    const verification = verifyTaggedCreatedTask(canonical, read.value);
    if (!verification.matches || verification.created === null) {
      const current = await this.dependencies.ledger.read(keyHash);
      if (current?.state === "task_created") {
        await this.dependencies.ledger.transition(keyHash, "verification_failed", {
          taskId,
          resultCode: "partial_success",
        });
      }
      throw this.error(
        "partial_success",
        "The task exists, but its fields, placement, or actual Tag ID set differs from the request.",
        {
          mayHaveWritten: true,
          taskId,
          idempotencyKey: effectiveKey,
          verificationDiff: verification.diff,
        },
      );
    }

    const warnings = createTaskWarnings(canonical);
    if (canonical.destination.kind === "project") {
      warnings.push(...await this.projectStateWarnings(canonical.destination.projectId));
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
    canonical: CanonicalTaggedCreateTaskPayload,
    effectiveKey: string,
  ): Promise<TaggedCreateTaskSuccess> {
    const read = await this.dependencies.readCreatedTaskForVerification(record.taskId!);
    if (!read.success) {
      throw this.error(
        "replay_target_unavailable",
        "The tagged replay target could not be read exactly.",
        {
          mayHaveWritten: true,
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
          reason: read.reason,
        },
      );
    }
    if (read.value.tagIds.length < 1 || read.value.tagIds.length > 5) {
      throw this.error(
        "replay_target_unavailable",
        "The tagged replay target's current Tag state is outside the compact success contract.",
        {
          mayHaveWritten: true,
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
          reason: "current_tag_state_out_of_contract",
        },
      );
    }

    const verification = verifyTaggedCreatedTask(canonical, read.value);
    if (verification.created === null) {
      throw this.error(
        "replay_target_unavailable",
        "The tagged replay target's current Tag state cannot be represented safely.",
        {
          mayHaveWritten: true,
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
          reason: "current_tag_state_out_of_contract",
        },
      );
    }
    const warnings = createTaskWarnings(canonical);
    if (!verification.matches) {
      warnings.push({
        code: "replayed_current_state_changed",
        message: "The existing tagged task has changed since the original create response.",
      });
    }
    return {
      success: true,
      created: verification.created,
      idempotency: {
        key: effectiveKey,
        replayed: true,
        replayUntil: record.replayUntil!,
      },
      warnings,
    };
  }

  private async projectStateWarnings(projectId: string): Promise<CreateTaskWarning[]> {
    const resolution = await this.safeResolveProjectById(projectId);
    if (!resolution.success) {
      const deterministicChange = resolution.reason === "not_found";
      return [{
        code: deterministicChange
          ? "project_state_changed_after_creation"
          : "project_state_unverified_after_creation",
        message: deterministicChange
          ? "The tagged task placement was verified, but the Project changed or disappeared immediately after creation."
          : "The tagged task placement was verified, but the Project's current eligibility could not be revalidated.",
      }];
    }
    if (resolution.project.rawStatus !== "Active" || resolution.project.ancestorFolderDropped) {
      return [{
        code: "project_state_changed_after_creation",
        message: "The tagged task placement was verified, but the Project became ineligible immediately after creation.",
      }];
    }
    return [];
  }

  private async safeResolveProjectById(projectId: string): Promise<ProjectDestinationResolution> {
    try {
      return await this.dependencies.resolveProjectById(projectId);
    } catch {
      return { success: false, reason: "query_failed" };
    }
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
