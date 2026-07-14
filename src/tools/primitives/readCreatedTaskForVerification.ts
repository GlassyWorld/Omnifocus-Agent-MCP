import { mapRawTaskToTaskView } from "../../domain/task/taskMapper.js";
import type { TaskView } from "../../domain/task/taskTypes.js";
import { adaptQueryTaskItem } from "../../domain/task/taskAdapter.js";
import {
  queryOmnifocus,
  type QueryOmnifocusParams,
} from "./queryOmnifocus.js";
import { GET_TASK_RAW_FIELDS } from "./getTask.js";

export interface CreatedTaskVerificationRead {
  task: TaskView;
  tagIds: string[];
}

export type CreatedTaskVerificationReadFailureReason =
  | "query_failed"
  | "not_exact"
  | "task_schema_drift"
  | "tag_schema_drift";

export type CreatedTaskVerificationReadResult =
  | { success: true; value: CreatedTaskVerificationRead }
  | {
      success: false;
      reason: CreatedTaskVerificationReadFailureReason;
      taskExists: boolean;
    };

interface QueryResult {
  success: boolean;
  items?: unknown[];
  count?: number;
  error?: string;
}

export type VerificationQueryRunner = (
  params: QueryOmnifocusParams,
) => Promise<QueryResult>;

export const CREATED_TASK_VERIFICATION_FIELDS = [
  ...GET_TASK_RAW_FIELDS,
  "tags",
] as const;

export async function readCreatedTaskForVerification(
  taskId: string,
  runner: VerificationQueryRunner = queryOmnifocus,
): Promise<CreatedTaskVerificationReadResult> {
  const result = await runner({
    entity: "tasks",
    filters: { taskId },
    fields: [...CREATED_TASK_VERIFICATION_FIELDS],
    includeCompleted: true,
    limit: 2,
  });

  if (!result.success) {
    return { success: false, reason: "query_failed", taskExists: false };
  }
  if (!Array.isArray(result.items) || result.items.length !== 1) {
    return { success: false, reason: "not_exact", taskExists: false };
  }

  const item = result.items[0];
  const adaptedTask = adaptQueryTaskItem(asQueryItem(item));
  if (!adaptedTask.success) {
    return { success: false, reason: "task_schema_drift", taskExists: true };
  }

  let task: TaskView;
  try {
    task = mapRawTaskToTaskView(adaptedTask.task);
  } catch {
    return { success: false, reason: "task_schema_drift", taskExists: true };
  }

  const tagIds = adaptVerificationTagIds(asQueryItem(item).tags);
  if (!tagIds.success) {
    return { success: false, reason: "tag_schema_drift", taskExists: true };
  }
  return { success: true, value: { task, tagIds: tagIds.tagIds } };
}

export type VerificationTagIdAdapterResult =
  | { success: true; tagIds: string[] }
  | { success: false };

export function adaptVerificationTagIds(input: unknown): VerificationTagIdAdapterResult {
  if (
    !Array.isArray(input)
    || !input.every(value => typeof value === "string" && value.length > 0)
  ) {
    return { success: false };
  }
  if (new Set(input).size !== input.length) return { success: false };
  return { success: true, tagIds: [...input].sort(compareCodeUnits) };
}

function asQueryItem(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : {};
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
