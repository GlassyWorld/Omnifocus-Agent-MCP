import {
  ProjectTaskStatusCounts,
  QueryProjectItem,
  RawProject,
} from './projectTypes.js';

export type ProjectAdapterResult =
  | { success: true; project: RawProject }
  | { success: false; error: string };

const PROJECT_STATUSES = new Set(['Active', 'OnHold', 'Done', 'Dropped']);
const TASK_STATUS_KEYS = [
  'available',
  'next',
  'blocked',
  'dueSoon',
  'overdue',
  'completed',
  'dropped',
] as const;

export function adaptQueryProjectItem(item: QueryProjectItem): ProjectAdapterResult {
  try {
    const project: RawProject = {
      id: requireNonEmptyString(item, 'id'),
      name: requireString(item, 'name'),
      note: requireString(item, 'note'),
      status: requireProjectStatus(item),
      sequential: requireBoolean(item, 'sequential'),
      flagged: requireBoolean(item, 'flagged'),
      containsSingletonActions: requireBoolean(item, 'containsSingletonActions'),
      completedByChildren: requireBoolean(item, 'completedByChildren'),
      folderId: optionalNonEmptyString(item, 'folderId'),
      folderName: optionalString(item, 'folderName'),
      directTaskIds: requireUniqueNonEmptyStringArray(item, 'directTaskIds'),
      taskIds: requireUniqueNonEmptyStringArray(item, 'taskIds'),
      taskStatusCounts: requireTaskStatusCounts(item),
      dueDate: optionalString(item, 'dueDate'),
      effectiveDueDate: optionalString(item, 'effectiveDueDate'),
      deferDate: optionalString(item, 'deferDate'),
      effectiveDeferDate: optionalString(item, 'effectiveDeferDate'),
      creationDate: optionalString(item, 'creationDate'),
      modificationDate: optionalString(item, 'modificationDate'),
    };

    if ((project.folderId === null) !== (project.folderName === null)) {
      throw new Error('folderId and folderName must both be present or both be null');
    }

    return { success: true, project };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown project adapter error',
    };
  }
}

function requireProjectStatus(item: QueryProjectItem): string {
  const status = requireString(item, 'status');
  if (!PROJECT_STATUSES.has(status)) {
    throw new Error('status must be Active, OnHold, Done, or Dropped');
  }
  return status;
}

function requireNonEmptyString(item: QueryProjectItem, field: string): string {
  const value = requireString(item, field);
  if (value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireString(item: QueryProjectItem, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function optionalString(item: QueryProjectItem, field: string): string | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string or null`);
  }
  return value;
}

function optionalNonEmptyString(item: QueryProjectItem, field: string): string | null {
  const value = optionalString(item, field);
  if (value !== null && value.length === 0) {
    throw new Error(`${field} must be null or a non-empty string`);
  }
  return value;
}

function requireBoolean(item: QueryProjectItem, field: string): boolean {
  const value = item[field];
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function requireUniqueNonEmptyStringArray(item: QueryProjectItem, field: string): string[] {
  const value = item[field];
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string' && entry.length > 0)) {
    throw new Error(`${field} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${field} must contain unique IDs`);
  }
  return [...value];
}

function requireTaskStatusCounts(item: QueryProjectItem): ProjectTaskStatusCounts {
  const value = item.taskStatusCounts;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('taskStatusCounts must be an object');
  }

  const counts = value as Record<string, unknown>;
  const result = {} as ProjectTaskStatusCounts;
  for (const key of TASK_STATUS_KEYS) {
    const count = counts[key];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`taskStatusCounts.${key} must be a non-negative integer`);
    }
    result[key] = count;
  }
  return result;
}
