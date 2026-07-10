import { z } from 'zod';
import type { ProjectTaskStatusCounts } from '../project/projectTypes.js';
import type { RawLeanProject } from './snapshotTypes.js';

export type SnapshotProjectAdapterResult =
  | { success: true; project: RawLeanProject }
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
const absoluteDateTimeSchema = z.string().datetime({ offset: true });

export function adaptSnapshotProjectItem(
  item: Record<string, unknown>,
): SnapshotProjectAdapterResult {
  try {
    const project: RawLeanProject = {
      id: requireNonEmptyString(item, 'id'),
      name: requireString(item, 'name'),
      hasNote: requireBoolean(item, 'hasNote'),
      status: requireProjectStatus(item),
      sequential: requireBoolean(item, 'sequential'),
      flagged: requireBoolean(item, 'flagged'),
      containsSingletonActions: requireBoolean(item, 'containsSingletonActions'),
      folderId: optionalNonEmptyString(item, 'folderId'),
      folderName: optionalString(item, 'folderName'),
      totalTaskCount: requireNonNegativeInteger(item, 'totalTaskCount'),
      taskStatusCounts: requireTaskStatusCounts(item),
      dueDate: optionalDateTime(item, 'dueDate'),
      effectiveDueDate: optionalDateTime(item, 'effectiveDueDate'),
      deferDate: optionalDateTime(item, 'deferDate'),
      effectiveDeferDate: optionalDateTime(item, 'effectiveDeferDate'),
    };

    if ((project.folderId === null) !== (project.folderName === null)) {
      throw new Error('folderId and folderName must both be present or both be null');
    }

    return { success: true, project };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown snapshot project adapter error',
    };
  }
}

function requireProjectStatus(item: Record<string, unknown>): RawLeanProject['status'] {
  const status = requireString(item, 'status');
  if (!PROJECT_STATUSES.has(status)) {
    throw new Error('status must be Active, OnHold, Done, or Dropped');
  }
  return status as RawLeanProject['status'];
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

function requireNonNegativeInteger(item: Record<string, unknown>, field: string): number {
  const value = item[field];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return value;
}

function requireTaskStatusCounts(item: Record<string, unknown>): ProjectTaskStatusCounts {
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

function optionalDateTime(item: Record<string, unknown>, field: string): string | null {
  const value = optionalString(item, field);
  if (value !== null && !absoluteDateTimeSchema.safeParse(value).success) {
    throw new Error(`${field} must be a valid ISO datetime with timezone or null`);
  }
  return value;
}
