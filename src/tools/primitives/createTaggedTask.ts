import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";
import type { CanonicalTaggedCreateTaskPayload } from "../../domain/taskCreation/createTaskTagSchemas.js";
import { SafeJxaExecutor } from "../../utils/safeJxaExecutor.js";
import type { JxaJsonExecutor } from "./createInboxTask.js";

export type TaggedTaskFailureCategory =
  | "tag_not_found"
  | "tag_not_allowed"
  | "mutually_exclusive_tags"
  | "tag_validation_failed"
  | "project_not_found"
  | "project_not_active"
  | "project_validation_failed"
  | "postcreate_failure"
  | "unknown";

export type CreateTaggedTaskResult =
  | {
      success: true;
      taskId: string;
      destination: { kind: "inbox" } | { kind: "project"; projectId: string };
      tagIds: string[];
    }
  | {
      success: false;
      phase: "prewrite" | "postcreate" | "unknown";
      taskId?: string;
      errorCategory: TaggedTaskFailureCategory;
      reason?: string;
    };

const destinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inbox") }).strict(),
  z.object({
    kind: z.literal("project"),
    projectId: z.string().min(1),
  }).strict(),
]);

const failureCategorySchema = z.enum([
  "tag_not_found",
  "tag_not_allowed",
  "mutually_exclusive_tags",
  "tag_validation_failed",
  "project_not_found",
  "project_not_active",
  "project_validation_failed",
  "postcreate_failure",
  "unknown",
]);

const resultSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    taskId: z.string().min(1),
    destination: destinationSchema,
    tagIds: z.array(z.string().min(1)),
  }).strict(),
  z.object({
    success: z.literal(false),
    phase: z.enum(["prewrite", "postcreate", "unknown"]),
    taskId: z.string().min(1).nullable().optional(),
    errorCategory: failureCategorySchema,
    reason: z.string().min(1).nullable().optional(),
  }).strict(),
]);

const PREWRITE_REASONS: Readonly<Record<Exclude<TaggedTaskFailureCategory, "postcreate_failure" | "unknown">, readonly string[]>> = {
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
  project_not_found: ["not_found"],
  project_not_active: ["on_hold", "done", "dropped", "dropped_ancestor"],
  project_validation_failed: [
    "ancestor_state_unknown",
    "canonical_id_mismatch",
    "schema_drift",
  ],
};

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
  if (result.errorCategory === "postcreate_failure" || result.errorCategory === "unknown") {
    return false;
  }
  return PREWRITE_REASONS[result.errorCategory].includes(result.reason);
}

function toEpochMilliseconds(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function scriptPath(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "utils",
    "omnifocusScripts",
    "createTaggedTask.js",
  );
}

function sortedUnique(values: readonly string[]): string[] | null {
  if (new Set(values).size !== values.length) return null;
  return [...values].sort(compareCodeUnits);
}

function successMatchesRequest(
  result: Extract<z.infer<typeof resultSchema>, { success: true }>,
  payload: CanonicalTaggedCreateTaskPayload,
): boolean {
  if (result.destination.kind !== payload.destination.kind) return false;
  if (
    result.destination.kind === "project"
    && (
      payload.destination.kind !== "project"
      || result.destination.projectId !== payload.destination.projectId
    )
  ) return false;
  const actual = sortedUnique(result.tagIds);
  return actual !== null
    && JSON.stringify(actual) === JSON.stringify(payload.tagIds);
}

export async function createTaggedTask(
  payload: CanonicalTaggedCreateTaskPayload,
  executor: JxaJsonExecutor = new SafeJxaExecutor(),
): Promise<CreateTaggedTaskResult> {
  try {
    const raw = await executor.execute(scriptPath(), {
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

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const _testExports = {
  PREWRITE_REASONS,
  hasTrustedFailureCombination,
  resultSchema,
  scriptPath,
  sortedUnique,
  successMatchesRequest,
  toEpochMilliseconds,
};
