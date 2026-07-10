import { adaptQueryCompletedTaskItem } from '../../domain/completion/completionAdapter.js';
import { RawCompletedTask } from '../../domain/completion/completionTypes.js';
import { queryOmnifocus } from './queryOmnifocus.js';

export const GET_COMPLETED_TASK_RAW_FIELDS = [
  "id",
  "name",
  "note",
  "completionDate",
  "projectId",
  "projectName",
  "inInbox",
  "tagNames",
  "isProjectRoot",
  "hasChildren",
  "creationDate",
  "modificationDate",
] as const;

export type GetCompletedSinceParams = {
  since: string;
  until: string;
};

export type GetCompletedSinceResult =
  | { success: true; tasks: RawCompletedTask[]; count: number }
  | { success: false; error: string };

export async function getCompletedSince(
  params: GetCompletedSinceParams,
): Promise<GetCompletedSinceResult> {
  const result = await queryOmnifocus({
    entity: "tasks",
    filters: {
      completedSince: params.since,
      completedUntil: params.until,
    },
    fields: [...GET_COMPLETED_TASK_RAW_FIELDS],
    includeCompleted: true,
    sortBy: "completionDate",
    sortOrder: "desc",
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error || 'Unknown query error',
    };
  }

  const tasks: RawCompletedTask[] = [];
  for (const item of result.items || []) {
    const adapted = adaptQueryCompletedTaskItem(item);
    if (!adapted.success) {
      return {
        success: false,
        error: adapted.error,
      };
    }
    if (!adapted.task.isProjectRoot) {
      tasks.push(adapted.task);
    }
  }

  return {
    success: true,
    tasks,
    count: tasks.length,
  };
}
