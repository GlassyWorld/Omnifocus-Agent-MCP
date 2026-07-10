import { z } from 'zod';
import { QueryCompletedTaskItem, RawCompletedTask } from './completionTypes.js';

export type CompletionAdapterResult =
  | { success: true; task: RawCompletedTask }
  | { success: false; error: string };

const absoluteDateTimeSchema = z.string().datetime({ offset: true });

export function adaptQueryCompletedTaskItem(
  item: QueryCompletedTaskItem,
): CompletionAdapterResult {
  try {
    const task: RawCompletedTask = {
      id: requireNonEmptyString(item, 'id'),
      name: requireString(item, 'name'),
      note: requireString(item, 'note'),
      completionDate: requireAbsoluteDateTime(item, 'completionDate'),
      projectId: optionalNonEmptyString(item, 'projectId'),
      projectName: optionalString(item, 'projectName'),
      inInbox: requireBoolean(item, 'inInbox'),
      tagNames: requireStringArray(item, 'tagNames'),
      isProjectRoot: requireBoolean(item, 'isProjectRoot'),
      hasChildren: requireBoolean(item, 'hasChildren'),
      creationDate: optionalAbsoluteDateTime(item, 'creationDate'),
      modificationDate: optionalAbsoluteDateTime(item, 'modificationDate'),
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
      error: error instanceof Error ? error.message : 'Unknown completion adapter error',
    };
  }
}

function requireNonEmptyString(item: QueryCompletedTaskItem, field: string): string {
  const value = requireString(item, field);
  if (value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function requireString(item: QueryCompletedTaskItem, field: string): string {
  const value = item[field];
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`);
  }
  return value;
}

function optionalString(item: QueryCompletedTaskItem, field: string): string | null {
  const value = item[field];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string or null`);
  }
  return value;
}

function optionalNonEmptyString(item: QueryCompletedTaskItem, field: string): string | null {
  const value = optionalString(item, field);
  if (value !== null && value.length === 0) {
    throw new Error(`${field} must be null or a non-empty string`);
  }
  return value;
}

function requireBoolean(item: QueryCompletedTaskItem, field: string): boolean {
  const value = item[field];
  if (typeof value !== 'boolean') {
    throw new Error(`${field} must be a boolean`);
  }
  return value;
}

function requireStringArray(item: QueryCompletedTaskItem, field: string): string[] {
  const value = item[field];
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`${field} must be a string array`);
  }
  return [...value];
}

function requireAbsoluteDateTime(item: QueryCompletedTaskItem, field: string): string {
  const value = requireNonEmptyString(item, field);
  if (!isAbsoluteDateTime(value)) {
    throw new Error(`${field} must be a valid ISO datetime with timezone`);
  }
  return value;
}

function optionalAbsoluteDateTime(
  item: QueryCompletedTaskItem,
  field: string,
): string | null {
  const value = optionalString(item, field);
  if (value !== null && !isAbsoluteDateTime(value)) {
    throw new Error(`${field} must be a valid ISO datetime with timezone or null`);
  }
  return value;
}

function isAbsoluteDateTime(value: string): boolean {
  return absoluteDateTimeSchema.safeParse(value).success;
}
