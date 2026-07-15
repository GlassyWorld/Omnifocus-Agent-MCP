import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import type { CanonicalParentCreateTaskPayload } from "../../domain/taskCreation/createParentTaskSchemas.js";
import { SafeJxaExecutor } from "../../utils/safeJxaExecutor.js";
import type { JxaJsonExecutor } from "./createInboxTask.js";

export type ParentTaskFailureCategory =
  | "parent_not_found"
  | "parent_not_allowed"
  | "parent_not_active"
  | "parent_validation_failed"
  | "tag_not_found"
  | "tag_not_allowed"
  | "mutually_exclusive_tags"
  | "tag_validation_failed"
  | "postcreate_failure"
  | "unknown";

export type CreateTaskUnderParentResult =
  | {
      success: true;
      taskId: string;
      destination: {
        kind: "parentTask";
        parentTaskId: string;
        projectId: string | null;
      };
      tagIds: string[];
    }
  | {
      success: false;
      phase: "prewrite" | "postcreate" | "unknown";
      taskId?: string;
      errorCategory: ParentTaskFailureCategory;
      reason?: string;
    };

const failureCategorySchema = z.enum([
  "parent_not_found",
  "parent_not_allowed",
  "parent_not_active",
  "parent_validation_failed",
  "tag_not_found",
  "tag_not_allowed",
  "mutually_exclusive_tags",
  "tag_validation_failed",
  "postcreate_failure",
  "unknown",
]);

const resultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    taskId: z.string().min(1),
    destination: z.object({
      kind: z.literal("parentTask"),
      parentTaskId: z.string().min(1),
      projectId: z.string().min(1).nullable(),
    }).strict(),
    tagIds: z.array(z.string().min(1)).max(5),
  }).strict(),
  z.object({
    success: z.literal(false),
    phase: z.enum(["prewrite", "postcreate", "unknown"]),
    taskId: z.string().min(1).nullable().optional(),
    errorCategory: failureCategorySchema,
    reason: z.string().min(1).nullable().optional(),
  }).strict(),
]);

export const PARENT_PREWRITE_REASONS = {
  parent_not_found: ["not_found"],
  parent_not_allowed: ["project_root_not_allowed", "unsupported_parent_kind"],
  parent_not_active: [
    "self_completed",
    "self_dropped",
    "ancestor_completed",
    "ancestor_dropped",
    "project_not_active",
    "dropped_folder_ancestor",
  ],
  parent_validation_failed: [
    "query_failed",
    "schema_drift",
    "unknown_status",
    "malformed_id",
    "canonical_id_mismatch",
    "parent_chain_unreadable",
    "ancestor_state_unknown",
    "parent_chain_cycle",
    "orphan_parent",
  ],
  tag_not_found: ["not_found"],
  tag_not_allowed: [
    "self_on_hold",
    "self_dropped",
    "ancestor_on_hold",
    "ancestor_dropped",
  ],
  mutually_exclusive_tags: ["mutually_exclusive"],
  tag_validation_failed: [
    "duplicate_requested_id",
    "lookup_failed",
    "canonical_id_mismatch",
    "malformed_id",
    "unknown_status",
    "parent_unreadable",
    "property_unreadable",
    "parent_cycle",
    "schema_drift",
  ],
} as const;

type TrustedPrewriteCategory = keyof typeof PARENT_PREWRITE_REASONS;

export async function createTaskUnderParent(
  payload: CanonicalParentCreateTaskPayload,
  executor: JxaJsonExecutor = new SafeJxaExecutor(),
): Promise<CreateTaskUnderParentResult> {
  try {
    const raw = await executor.execute(resolveParentCreateScriptPath(), {
      destination: payload.destination,
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: toEpochMilliseconds(payload.plannedDate),
      dueDateEpochMs: toEpochMilliseconds(payload.dueDate),
      deferDateEpochMs: toEpochMilliseconds(payload.deferDate),
      flagged: payload.flagged,
      estimatedMinutes: payload.estimatedMinutes,
      tagIds: payload.tagIds,
    });
    const result = resultSchema.parse(raw);
    if (result.success) {
      if (successMatchesRequest(result, payload)) return result;
      return {
        success: false,
        phase: "postcreate",
        taskId: result.taskId,
        errorCategory: "postcreate_failure",
      };
    }
    if (!hasTrustedFailureCombination(result)) {
      return { success: false, phase: "unknown", errorCategory: "unknown" };
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
      return { success: false, phase: "unknown", errorCategory: "unknown" };
    }
    throw error;
  }
}

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
  if (hasTaskId || result.reason == null) return false;
  if (!(result.errorCategory in PARENT_PREWRITE_REASONS)) return false;
  return (PARENT_PREWRITE_REASONS[result.errorCategory as TrustedPrewriteCategory] as readonly string[])
    .includes(result.reason);
}

function successMatchesRequest(
  result: Extract<z.infer<typeof resultSchema>, { success: true }>,
  payload: CanonicalParentCreateTaskPayload,
): boolean {
  if (result.destination.parentTaskId !== payload.destination.parentTaskId) return false;
  const actualTags = sortedUnique(result.tagIds);
  return actualTags !== null
    && JSON.stringify(actualTags) === JSON.stringify(payload.tagIds);
}

function sortedUnique(values: readonly string[]): string[] | null {
  if (new Set(values).size !== values.length) return null;
  return [...values].sort(compareCodeUnits);
}

function toEpochMilliseconds(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function resolveParentCreateScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "utils", "omnifocusScripts", "createTaskUnderParent.js");
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const _testExports = {
  hasTrustedFailureCombination,
  resolveParentCreateScriptPath,
  resultSchema,
  sortedUnique,
  successMatchesRequest,
  toEpochMilliseconds,
};
