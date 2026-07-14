import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";
import type { CanonicalCreateTaskPayloadV2 } from "../../domain/taskCreation/createTaskSchemas.js";
import type { ProjectValidationReason } from "../../domain/taskCreation/projectDestination.js";
import { SafeJxaExecutor } from "../../utils/safeJxaExecutor.js";
import type { JxaJsonExecutor } from "./createInboxTask.js";

export type CreateTaskInProjectResult =
  | { success: true; taskId: string; projectId: string }
  | {
      success: false;
      phase: "prewrite" | "postcreate" | "unknown";
      taskId?: string;
      errorCategory: "project_not_found" | "project_not_active" | "project_validation_failed" | "postcreate_failure" | "unknown";
      reason?: ProjectValidationReason;
    };

const validationReasonSchema = z.enum([
  "not_found",
  "on_hold",
  "done",
  "dropped",
  "dropped_ancestor",
  "ambiguous_canonical_id",
  "query_failed",
  "adapter_failed",
  "schema_drift",
  "ancestor_state_unknown",
  "canonical_id_mismatch",
]);

const resultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    taskId: z.string().min(1),
    projectId: z.string().min(1),
  }).strict(),
  z.object({
    success: z.literal(false),
    phase: z.enum(["prewrite", "postcreate", "unknown"]),
    taskId: z.string().min(1).nullable().optional(),
    errorCategory: z.enum([
      "project_not_found",
      "project_not_active",
      "project_validation_failed",
      "postcreate_failure",
      "unknown",
    ]),
    reason: validationReasonSchema.nullable().optional(),
  }).strict(),
]);

function hasTrustedFailureCombination(
  result: Extract<z.infer<typeof resultSchema>, { success: false }>,
): boolean {
  const hasTaskId = result.taskId !== undefined && result.taskId !== null;
  if (result.phase === "unknown") {
    return result.errorCategory === "unknown" && !hasTaskId && result.reason == null;
  }
  if (result.phase === "postcreate") {
    return result.errorCategory === "postcreate_failure" && result.reason == null;
  }
  if (hasTaskId) return false;
  if (result.errorCategory === "project_not_found") return result.reason === "not_found";
  if (result.errorCategory === "project_not_active") {
    return ["on_hold", "done", "dropped", "dropped_ancestor"].includes(result.reason ?? "");
  }
  if (result.errorCategory === "project_validation_failed") {
    return [
      "ambiguous_canonical_id",
      "ancestor_state_unknown",
      "canonical_id_mismatch",
    ].includes(result.reason ?? "");
  }
  return false;
}

function toEpochMilliseconds(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function scriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "utils", "omnifocusScripts", "createTaskInProject.js");
}

export async function createTaskInProject(
  payload: CanonicalCreateTaskPayloadV2 & { destination: { kind: "project"; projectId: string } },
  executor: JxaJsonExecutor = new SafeJxaExecutor(),
): Promise<CreateTaskInProjectResult> {
  try {
    const raw = await executor.execute(scriptPath(), {
      projectId: payload.destination.projectId,
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: toEpochMilliseconds(payload.plannedDate),
      dueDateEpochMs: toEpochMilliseconds(payload.dueDate),
      deferDateEpochMs: toEpochMilliseconds(payload.deferDate),
      flagged: payload.flagged,
      estimatedMinutes: payload.estimatedMinutes,
    });
    const result = resultSchema.parse(raw);
    if (result.success) {
      if (result.projectId === payload.destination.projectId) return result;
      return {
        success: false,
        phase: "postcreate",
        taskId: result.taskId,
        errorCategory: "postcreate_failure",
        reason: "canonical_id_mismatch",
      };
    }
    if (!hasTrustedFailureCombination(result)) {
      return {
        success: false,
        phase: "unknown",
        errorCategory: "unknown",
        reason: "schema_drift",
      };
    }
    return {
      success: false,
      phase: result.phase,
      taskId: result.taskId ?? undefined,
      errorCategory: result.errorCategory,
      reason: result.reason ?? undefined,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        phase: "unknown",
        errorCategory: "unknown",
        reason: "schema_drift",
      };
    }
    throw error;
  }
}

export const _testExports = {
  toEpochMilliseconds,
  scriptPath,
  resultSchema,
  hasTrustedFailureCombination,
};
