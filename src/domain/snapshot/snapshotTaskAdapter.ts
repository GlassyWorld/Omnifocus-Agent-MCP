import { z } from 'zod';
import type { ActiveTaskStatus, RawLeanTask } from './snapshotTypes.js';

export type SnapshotTaskAdapterResult =
  | { success: true; task: RawLeanTask }
  | { success: false; error: string };

const ACTIVE_TASK_STATUSES = new Set<ActiveTaskStatus>([
  'Available',
  'Blocked',
  'DueSoon',
  'Next',
  'Overdue',
]);
const absoluteDateTimeSchema = z.string().datetime({ offset: true });

export function adaptSnapshotTaskItem(item: Record<string, unknown>): SnapshotTaskAdapterResult {
  try {
    const task: RawLeanTask = {
      id: requireNonEmptyString(item, 'id'),
      name: requireString(item, 'name'),
      hasNote: requireBoolean(item, 'hasNote'),
      taskStatus: requireActiveTaskStatus(item),
      flagged: requireBoolean(item, 'flagged'),
      effectiveFlagged: requireBoolean(item, 'effectiveFlagged'),
      dueDate: optionalDateTime(item, 'dueDate'),
      effectiveDueDate: optionalDateTime(item, 'effectiveDueDate'),
      deferDate: optionalDateTime(item, 'deferDate'),
      effectiveDeferDate: optionalDateTime(item, 'effectiveDeferDate'),
      plannedDate: optionalDateTime(item, 'plannedDate'),
      effectivePlannedDate: optionalDateTime(item, 'effectivePlannedDate'),
      tagNames: requireStringArray(item, 'tagNames'),
      projectName: optionalString(item, 'projectName'),
      projectId: optionalNonEmptyString(item, 'projectId'),
      inInbox: requireBoolean(item, 'inInbox'),
      isProjectRoot: requireBoolean(item, 'isProjectRoot'),
      hasChildren: requireBoolean(item, 'hasChildren'),
      creationDate: optionalDateTime(item, 'creationDate'),
    };

    if (task.projectId !== null && task.projectName === null) {
      throw new Error('projectName must be a string when projectId is present');
    }
    if (task.projectId === null && task.projectName !== null) {
      if (task.projectName !== 'Inbox' || !task.inInbox) {
        throw new Error('projectName must be null or "Inbox" for an Inbox task');
      }
    }

    return { success: true, task };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown snapshot task adapter error',
    };
  }
}

function requireActiveTaskStatus(item: Record<string, unknown>): ActiveTaskStatus {
  const status = requireString(item, 'taskStatus') as ActiveTaskStatus;
  if (!ACTIVE_TASK_STATUSES.has(status)) {
    throw new Error('taskStatus must be an active OmniFocus task status');
  }
  return status;
}

function requireNonEmptyString(item: Record<string, unknown>, field: string): string {
  const value = requireString(item, field);
  if (value.length === 0) throw new Error(`${field} must be a non-empty string`);
  return value;
}

function requireString(item: Record<string, unknown>, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  return value;
}

function optionalString(item: Record<string, unknown>, field: string): string | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new Error(`${field} must be a string or null`);
  return value;
}

function optionalNonEmptyString(item: Record<string, unknown>, field: string): string | null {
  const value = optionalString(item, field);
  if (value !== null && value.length === 0) {
    throw new Error(`${field} must be null or a non-empty string`);
  }
  return value;
}

function requireBoolean(item: Record<string, unknown>, field: string): boolean {
  const value = item[field];
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function requireStringArray(item: Record<string, unknown>, field: string): string[] {
  const value = item[field];
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`${field} must be a string array`);
  }
  return [...value];
}

function optionalDateTime(item: Record<string, unknown>, field: string): string | null {
  const value = optionalString(item, field);
  if (value !== null && !absoluteDateTimeSchema.safeParse(value).success) {
    throw new Error(`${field} must be a valid ISO datetime with timezone or null`);
  }
  return value;
}
