import { QueryTaskItem, RawTask } from './taskTypes.js';

export type TaskAdapterResult =
  | { success: true; task: RawTask }
  | { success: false; error: string };

export function adaptQueryTaskItem(item: QueryTaskItem): TaskAdapterResult {
  try {
    const task: RawTask = {
      id: requireNonEmptyString(item, 'id'),
      name: requireString(item, 'name'),
      note: requireString(item, 'note'),
      taskStatus: requireString(item, 'taskStatus'),
      flagged: requireBoolean(item, 'flagged'),
      effectiveFlagged: requireBoolean(item, 'effectiveFlagged'),
      completed: requireBoolean(item, 'completed'),
      completionDate: optionalString(item, 'completionDate'),
      effectiveCompletedDate: optionalString(item, 'effectiveCompletedDate'),
      dropDate: optionalString(item, 'dropDate'),
      effectiveDropDate: optionalString(item, 'effectiveDropDate'),
      dueDate: optionalString(item, 'dueDate'),
      effectiveDueDate: optionalString(item, 'effectiveDueDate'),
      deferDate: optionalString(item, 'deferDate'),
      effectiveDeferDate: optionalString(item, 'effectiveDeferDate'),
      plannedDate: optionalString(item, 'plannedDate'),
      effectivePlannedDate: optionalString(item, 'effectivePlannedDate'),
      tagNames: requireStringArray(item, 'tagNames'),
      projectName: optionalString(item, 'projectName'),
      projectId: optionalNonEmptyString(item, 'projectId'),
      inInbox: requireBoolean(item, 'inInbox'),
      isProjectRoot: requireBoolean(item, 'isProjectRoot'),
      parentId: optionalString(item, 'parentId'),
      childIds: requireStringArray(item, 'childIds'),
      hasChildren: requireBoolean(item, 'hasChildren'),
      sequential: requireBoolean(item, 'sequential'),
      completedByChildren: requireBoolean(item, 'completedByChildren'),
      isRepeating: requireBoolean(item, 'isRepeating'),
      repetitionRule: optionalString(item, 'repetitionRule'),
      estimatedMinutes: optionalNumber(item, 'estimatedMinutes'),
      creationDate: optionalString(item, 'creationDate'),
      modificationDate: optionalString(item, 'modificationDate'),
    };

    if (task.projectId !== null && task.projectName === null) {
      throw new Error('projectName must be a string when projectId is present');
    }

    if (task.projectId === null && task.projectName !== null && task.projectName !== 'Inbox') {
      throw new Error('projectName must be null or "Inbox" when projectId is null');
    }

    return { success: true, task };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown adapter error',
    };
  }
}

function requireNonEmptyString(item: QueryTaskItem, field: string): string {
  const value = requireString(item, field);
  if (value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireString(item: QueryTaskItem, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function optionalString(item: QueryTaskItem, field: string): string | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string or null`);
  }
  return value;
}

function optionalNonEmptyString(item: QueryTaskItem, field: string): string | null {
  const value = optionalString(item, field);
  if (value !== null && value.length === 0) {
    throw new Error(`${field} must be null or a non-empty string`);
  }
  return value;
}

function requireBoolean(item: QueryTaskItem, field: string): boolean {
  const value = item[field];
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function requireStringArray(item: QueryTaskItem, field: string): string[] {
  const value = item[field];
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`${field} must be a string array`);
  }
  return [...value];
}

function optionalNumber(item: QueryTaskItem, field: string): number | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number') {
    throw new Error(`${field} must be a number or null`);
  }
  return value;
}
