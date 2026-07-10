import { composeLeanSnapshot } from '../../domain/snapshot/leanSnapshotComposer.js';
import { adaptSnapshotProjectItem } from '../../domain/snapshot/snapshotProjectAdapter.js';
import { adaptSnapshotTaskItem } from '../../domain/snapshot/snapshotTaskAdapter.js';
import type {
  LeanSnapshotView,
  RawLeanProject,
  RawLeanTask,
} from '../../domain/snapshot/snapshotTypes.js';
import { queryOmnifocus } from './queryOmnifocus.js';

export const GET_LEAN_TASK_RAW_FIELDS = [
  'id',
  'name',
  'hasNote',
  'taskStatus',
  'flagged',
  'effectiveFlagged',
  'dueDate',
  'effectiveDueDate',
  'deferDate',
  'effectiveDeferDate',
  'plannedDate',
  'effectivePlannedDate',
  'tagNames',
  'projectName',
  'projectId',
  'inInbox',
  'isProjectRoot',
  'hasChildren',
  'creationDate',
] as const;

export const GET_LEAN_PROJECT_RAW_FIELDS = [
  'id',
  'name',
  'hasNote',
  'status',
  'sequential',
  'flagged',
  'containsSingletonActions',
  'folderId',
  'folderName',
  'totalTaskCount',
  'taskStatusCounts',
  'dueDate',
  'effectiveDueDate',
  'deferDate',
  'effectiveDeferDate',
] as const;

export type GetLeanSnapshotParams = {
  generatedAt: string;
  limitPerSection: number;
};

export type GetLeanSnapshotResult =
  | { success: true; snapshot: LeanSnapshotView }
  | { success: false; error: string };

export async function getLeanSnapshot(
  params: GetLeanSnapshotParams,
): Promise<GetLeanSnapshotResult> {
  try {
    const [taskResult, projectResult] = await Promise.all([
      queryOmnifocus({
        entity: 'tasks',
        fields: [...GET_LEAN_TASK_RAW_FIELDS],
        includeCompleted: false,
      }),
      queryOmnifocus({
        entity: 'projects',
        filters: { status: ['Active'] },
        fields: [...GET_LEAN_PROJECT_RAW_FIELDS],
        includeCompleted: false,
      }),
    ]);

    if (!taskResult.success) {
      return { success: false, error: `Task query failed: ${taskResult.error || 'Unknown query error'}` };
    }
    if (!projectResult.success) {
      return { success: false, error: `Project query failed: ${projectResult.error || 'Unknown query error'}` };
    }

    const tasks: RawLeanTask[] = [];
    for (const [index, item] of (taskResult.items || []).entries()) {
      const adapted = adaptSnapshotTaskItem(item);
      if (!adapted.success) {
        return { success: false, error: `Task adapter failed at index ${index}: ${adapted.error}` };
      }
      tasks.push(adapted.task);
    }

    const projects: RawLeanProject[] = [];
    for (const [index, item] of (projectResult.items || []).entries()) {
      const adapted = adaptSnapshotProjectItem(item);
      if (!adapted.success) {
        return { success: false, error: `Project adapter failed at index ${index}: ${adapted.error}` };
      }
      projects.push(adapted.project);
    }

    return {
      success: true,
      snapshot: composeLeanSnapshot({
        generatedAt: params.generatedAt,
        limitPerSection: params.limitPerSection,
        tasks,
        projects,
      }),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Lean Snapshot error',
    };
  }
}
