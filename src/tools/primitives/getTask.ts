import { adaptQueryTaskItem } from '../../domain/task/taskAdapter.js';
import { RawTask } from '../../domain/task/taskTypes.js';
import { queryOmnifocus } from './queryOmnifocus.js';

export const GET_TASK_RAW_FIELDS = [
  "id",
  "name",
  "note",
  "taskStatus",
  "flagged",
  "effectiveFlagged",
  "completed",
  "completionDate",
  "effectiveCompletedDate",
  "dropDate",
  "effectiveDropDate",
  "dueDate",
  "effectiveDueDate",
  "deferDate",
  "effectiveDeferDate",
  "plannedDate",
  "effectivePlannedDate",
  "tagNames",
  "projectName",
  "projectId",
  "inInbox",
  "isProjectRoot",
  "parentId",
  "childIds",
  "hasChildren",
  "sequential",
  "completedByChildren",
  "isRepeating",
  "repetitionRule",
  "estimatedMinutes",
  "creationDate",
  "modificationDate",
] as const;

export type GetTaskParams =
  | { id: string; name?: never }
  | { id?: never; name: string };

export type GetTaskResult =
  | { success: true; tasks: RawTask[]; count: number }
  | { success: false; error: string };

export async function getTask(params: GetTaskParams): Promise<GetTaskResult> {
  const result = await queryOmnifocus({
    entity: "tasks",
    filters: "id" in params
      ? { taskId: params.id }
      : { taskNameExact: params.name },
    fields: [...GET_TASK_RAW_FIELDS],
    includeCompleted: true,
    limit: 2,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Unknown query error',
    };
  }

  const tasks: RawTask[] = [];
  for (const item of result.items || []) {
    const adapted = adaptQueryTaskItem(item);
    if (!adapted.success) {
      return {
        success: false,
        error: adapted.error,
      };
    }
    tasks.push(adapted.task);
  }

  return {
    success: true,
    tasks,
    count: result.count ?? tasks.length,
  };
}
