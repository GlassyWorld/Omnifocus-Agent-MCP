import { mapRawTaskToTaskView } from "../task/taskMapper.js";
import type { RawTask } from "../task/taskTypes.js";
import {
  canonicalizeCreateTaskInput,
  createTaskWarnings,
  fingerprintCreateTaskPayload,
} from "./createTaskCanonicalizer.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import {
  CreateTaskLedger,
  hashIdempotencyKey,
  type IdempotencyLedgerRecord,
} from "./createTaskLedger.js";
import type {
  CanonicalCreateTaskPayloadV2,
  CreateTaskInput,
  CreateTaskSuccess,
  CreateTaskWarning,
} from "./createTaskSchemas.js";
import { verifyCreatedTask } from "./createTaskVerifier.js";
import {
  type ProjectDestinationResolution,
  validateProjectDestination,
} from "./projectDestination.js";
import type { CreateInboxTaskResult } from "../../tools/primitives/createInboxTask.js";
import type { CreateTaskInProjectResult } from "../../tools/primitives/createTaskInProject.js";

export interface ExactTaskReaderResult {
  success: boolean;
  tasks?: RawTask[];
  error?: string;
}

type ProjectCreatePayload = CanonicalCreateTaskPayloadV2 & {
  destination: { kind: "project"; projectId: string };
};

export interface CreateTaskServiceDependencies {
  ledger: CreateTaskLedger;
  createInboxTask: (payload: CanonicalCreateTaskPayloadV2) => Promise<CreateInboxTaskResult>;
  createTaskInProject: (payload: ProjectCreatePayload) => Promise<CreateTaskInProjectResult>;
  resolveProjectById: (projectId: string) => Promise<ProjectDestinationResolution>;
  readTaskById: (taskId: string) => Promise<ExactTaskReaderResult>;
  now?: () => Date;
}

export class CreateTaskService {
  private readonly now: () => Date;

  constructor(private readonly dependencies: CreateTaskServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  async execute(input: CreateTaskInput, effectiveKey: string): Promise<CreateTaskSuccess> {
    const canonical = canonicalizeCreateTaskInput(input);
    const payloadHash = fingerprintCreateTaskPayload(canonical);
    const keyHash = hashIdempotencyKey(effectiveKey);

    return this.dependencies.ledger.withGlobalLock(async () => {
      const record = await this.dependencies.ledger.reserve(keyHash, payloadHash);
      if (record.payloadHash !== payloadHash) {
        throw this.error("idempotency_conflict", "The idempotency key is already bound to a different semantic payload.", {
          mayHaveWritten: !["reserved", "retryable_validation_error", "terminal_prewrite_error"].includes(record.state),
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
        });
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
          throw this.error(validation.code, "The requested Project destination could not be validated for creation.", {
            mayHaveWritten: false,
            idempotencyKey: effectiveKey,
            reason: validation.reason,
          }, validation.retrySafe);
        }
      }

      await this.dependencies.ledger.transition(keyHash, "write_started");
      let primitive: CreateInboxTaskResult | CreateTaskInProjectResult;
      try {
        primitive = canonical.destination.kind === "inbox"
          ? await this.dependencies.createInboxTask(canonical)
          : await this.dependencies.createTaskInProject(canonical as ProjectCreatePayload);
      } catch (error) {
        await this.dependencies.ledger.transition(keyHash, "outcome_unknown", {
          resultCode: "verification_failed.outcome_unknown",
        });
        if (error instanceof CreateTaskOperationError) {
          throw this.error("verification_failed", error.message, {
            mayHaveWritten: true,
            idempotencyKey: effectiveKey,
            reason: error.detail.reason ?? "outcome_unknown",
          });
        }
        throw this.error("verification_failed", "The create operation ended with an unknown outcome.", {
          mayHaveWritten: true,
          idempotencyKey: effectiveKey,
          reason: "outcome_unknown",
        });
      }

      if (!primitive.success) {
        if (primitive.phase === "prewrite") {
          const projectFailure = canonical.destination.kind === "project"
            ? primitive as Exclude<CreateTaskInProjectResult, { success: true }>
            : null;
          if (
            projectFailure !== null
            && projectFailure.errorCategory === "project_validation_failed"
          ) {
            await this.dependencies.ledger.transition(keyHash, "retryable_validation_error", {
              resultCode: `project_validation_failed.${projectFailure.reason ?? "adapter_failed"}`,
            });
            throw this.error("project_validation_failed", "The Project could not be revalidated immediately before creation.", {
              mayHaveWritten: false,
              idempotencyKey: effectiveKey,
              reason: projectFailure.reason ?? "adapter_failed",
            }, true);
          }

          const code = projectFailure !== null
            && (projectFailure.errorCategory === "project_not_found" || projectFailure.errorCategory === "project_not_active")
            ? projectFailure.errorCategory
            : "write_failed";
          const reason = projectFailure?.reason;
          await this.dependencies.ledger.transition(keyHash, "terminal_prewrite_error", {
            resultCode: reason ? `${code}.${reason}` : code,
          });
          throw this.error(code, "OmniFocus rejected the task before creation.", {
            mayHaveWritten: false,
            idempotencyKey: effectiveKey,
            reason,
          });
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
        throw this.error("verification_failed", "Task creation may have occurred, but no task ID was returned.", {
          mayHaveWritten: true,
          idempotencyKey: effectiveKey,
          reason: "missing_task_id",
        });
      }

      await this.dependencies.ledger.transition(keyHash, "task_created", {
        taskId: primitive.taskId,
      });
      return this.verifyNewTask(keyHash, primitive.taskId, canonical, effectiveKey);
    });
  }

  private async handleExisting(
    record: IdempotencyLedgerRecord,
    canonical: CanonicalCreateTaskPayloadV2,
    effectiveKey: string,
  ): Promise<CreateTaskSuccess> {
    if (record.state === "verified") {
      if (!record.taskId || !record.replayUntil) {
        throw this.error("write_disabled", "The verified idempotency tombstone is incomplete.", { mayHaveWritten: true });
      }
      if (this.now().getTime() > Date.parse(record.replayUntil)) {
        throw this.error("duplicate_request", "The request was already used and its replay window has expired.", {
          mayHaveWritten: true,
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
          reason: "replay_window_expired",
        });
      }
      return this.replay(record, canonical, effectiveKey);
    }
    if (record.state === "task_created" || record.state === "verification_failed") {
      if (!record.taskId) {
        throw this.error("write_disabled", "The create_task tombstone is missing its task ID.", { mayHaveWritten: true });
      }
      return this.verifyNewTask(record.keyHash, record.taskId, canonical, effectiveKey);
    }
    const mayHaveWritten = record.state === "write_started" || record.state === "outcome_unknown";
    if (record.state === "write_started") {
      await this.dependencies.ledger.transition(record.keyHash, "outcome_unknown", {
        resultCode: "verification_failed.outcome_unknown",
      });
    }
    throw this.error("duplicate_request", "The idempotency key has already been used and cannot execute another write.", {
      mayHaveWritten,
      taskId: record.taskId,
      idempotencyKey: effectiveKey,
      reason: mayHaveWritten ? "outcome_unknown" : "prior_prewrite_attempt",
    });
  }

  private async verifyNewTask(
    keyHash: string,
    taskId: string,
    canonical: CanonicalCreateTaskPayloadV2,
    effectiveKey: string,
  ): Promise<CreateTaskSuccess> {
    let task;
    try {
      task = await this.readOne(taskId, "verification_failed", effectiveKey);
    } catch (error) {
      const current = await this.dependencies.ledger.read(keyHash);
      if (current?.state === "task_created") {
        await this.dependencies.ledger.transition(keyHash, "verification_failed", {
          taskId,
          resultCode: "verification_failed",
        });
      }
      throw error;
    }
    const verification = verifyCreatedTask(canonical, task);
    if (!verification.matches) {
      const current = await this.dependencies.ledger.read(keyHash);
      if (current?.state === "task_created") {
        await this.dependencies.ledger.transition(keyHash, "verification_failed", {
          taskId,
          resultCode: "partial_success",
        });
      }
      throw this.error("partial_success", "The task exists, but its verified placement or fields differ from the request.", {
        mayHaveWritten: true,
        taskId,
        idempotencyKey: effectiveKey,
        verificationDiff: verification.diff,
      });
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

  private async projectStateWarnings(projectId: string): Promise<CreateTaskWarning[]> {
    const resolution = await this.safeResolveProjectById(projectId);
    if (!resolution.success) {
      const deterministicChange = resolution.reason === "not_found";
      return [{
        code: deterministicChange
          ? "project_state_changed_after_creation"
          : "project_state_unverified_after_creation",
        message: deterministicChange
          ? "The task placement was verified, but the Project changed or disappeared immediately after creation."
          : "The task placement was verified, but the Project's current eligibility could not be revalidated.",
      }];
    }
    if (resolution.project.rawStatus !== "Active" || resolution.project.ancestorFolderDropped) {
      return [{
        code: "project_state_changed_after_creation",
        message: "The task placement was verified, but the Project became ineligible immediately after creation.",
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

  private async replay(
    record: IdempotencyLedgerRecord,
    canonical: CanonicalCreateTaskPayloadV2,
    effectiveKey: string,
  ): Promise<CreateTaskSuccess> {
    const task = await this.readOne(record.taskId!, "replay_target_unavailable", effectiveKey);
    const verification = verifyCreatedTask(canonical, task);
    const warnings = createTaskWarnings(canonical);
    if (!verification.matches) {
      warnings.push({
        code: "replayed_current_state_changed",
        message: "The existing task has changed since the original create response.",
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

  private async readOne(
    taskId: string,
    code: "verification_failed" | "replay_target_unavailable",
    effectiveKey: string,
  ) {
    const result = await this.dependencies.readTaskById(taskId);
    if (!result.success || !result.tasks || result.tasks.length !== 1) {
      throw this.error(code, "The created task could not be read back exactly by ID.", {
        mayHaveWritten: true,
        taskId,
        idempotencyKey: effectiveKey,
      });
    }
    try {
      return mapRawTaskToTaskView(result.tasks[0]);
    } catch {
      throw this.error(code, "The created task readback did not satisfy the Task Domain contract.", {
        mayHaveWritten: true,
        taskId,
        idempotencyKey: effectiveKey,
        reason: "readback_schema_drift",
      });
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
