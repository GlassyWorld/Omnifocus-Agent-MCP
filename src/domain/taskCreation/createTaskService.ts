import { mapRawTaskToTaskView } from "../task/taskMapper.js";
import { RawTask } from "../task/taskTypes.js";
import {
  canonicalizeCreateTaskInput,
  createTaskWarnings,
  fingerprintCreateTaskPayload,
} from "./createTaskCanonicalizer.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import {
  CreateTaskLedger,
  hashIdempotencyKey,
  IdempotencyLedgerRecord,
} from "./createTaskLedger.js";
import { CreateTaskInput, CreateTaskSuccess } from "./createTaskSchemas.js";
import { verifyCreatedInboxTask } from "./createTaskVerifier.js";
import { CreateInboxTaskResult } from "../../tools/primitives/createInboxTask.js";

export interface ExactTaskReaderResult {
  success: boolean;
  tasks?: RawTask[];
  error?: string;
}

export interface CreateTaskServiceDependencies {
  ledger: CreateTaskLedger;
  createInboxTask: (payload: ReturnType<typeof canonicalizeCreateTaskInput>) => Promise<CreateInboxTaskResult>;
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
          mayHaveWritten: record.state !== "reserved" && record.state !== "terminal_prewrite_error",
          taskId: record.taskId,
          idempotencyKey: effectiveKey,
        });
      }
      if (record.state !== "reserved") {
        return this.handleExisting(record, canonical, effectiveKey);
      }

      await this.dependencies.ledger.transition(keyHash, "write_started");
      let primitive: CreateInboxTaskResult;
      try {
        primitive = await this.dependencies.createInboxTask(canonical);
      } catch (error) {
        await this.dependencies.ledger.transition(keyHash, "outcome_unknown", {
          resultCode: "verification_failed",
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
          await this.dependencies.ledger.transition(keyHash, "terminal_prewrite_error", {
            resultCode: "write_failed",
          });
          throw this.error("write_failed", "OmniFocus rejected the task before creation.", {
            mayHaveWritten: false,
            idempotencyKey: effectiveKey,
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
          resultCode: "verification_failed",
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
    canonical: ReturnType<typeof canonicalizeCreateTaskInput>,
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
        resultCode: "verification_failed",
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
    canonical: ReturnType<typeof canonicalizeCreateTaskInput>,
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
    const verification = verifyCreatedInboxTask(canonical, task);
    if (!verification.matches) {
      const current = await this.dependencies.ledger.read(keyHash);
      if (current?.state === "task_created") {
        await this.dependencies.ledger.transition(keyHash, "verification_failed", {
          taskId,
          resultCode: "partial_success",
        });
      }
      throw this.error("partial_success", "The task exists, but its verified state differs from the request.", {
        mayHaveWritten: true,
        taskId,
        idempotencyKey: effectiveKey,
        verificationDiff: verification.diff,
      });
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
      warnings: createTaskWarnings(canonical),
    };
  }

  private async replay(
    record: IdempotencyLedgerRecord,
    canonical: ReturnType<typeof canonicalizeCreateTaskInput>,
    effectiveKey: string,
  ): Promise<CreateTaskSuccess> {
    const task = await this.readOne(record.taskId!, "replay_target_unavailable", effectiveKey);
    const verification = verifyCreatedInboxTask(canonical, task);
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
  ): CreateTaskOperationError {
    return new CreateTaskOperationError({ code, message, retrySafe: false, ...detail });
  }
}
