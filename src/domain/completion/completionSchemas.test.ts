import { describe, expect, it } from 'vitest';
import type { CompletedTaskView } from './completionTypes.js';
import {
  completedTaskViewSchema,
  getCompletedSinceSuccessSchema,
} from './completionSchemas.js';

const validCompletedTask: CompletedTaskView = {
  id: 'task-1',
  name: 'Completed task',
  note: '',
  kind: 'action',
  completedDate: '2026-07-01T01:00:00.000Z',
  project: null,
  location: { inInbox: true },
  tags: [],
  timestamps: { created: null, modified: null },
};

describe('CompletedTaskView output schema', () => {
  it('accepts complete events, nullable context, and an empty success list', () => {
    expect(completedTaskViewSchema.parse(validCompletedTask)).toEqual(validCompletedTask);
    expect(getCompletedSinceSuccessSchema.safeParse({ success: true, completed: [] }).success).toBe(true);
    expect(getCompletedSinceSuccessSchema.safeParse({
      success: true,
      completed: [validCompletedTask],
    }).success).toBe(true);
  });

  it('requires absolute completion timestamps and required nested fields', () => {
    expect(completedTaskViewSchema.safeParse({
      ...validCompletedTask,
      completedDate: '2026-07-01',
    }).success).toBe(false);
    const { inInbox: _inInbox, ...incompleteLocation } = validCompletedTask.location;
    expect(completedTaskViewSchema.safeParse({
      ...validCompletedTask,
      location: incompleteLocation,
    }).success).toBe(false);
  });

  it('rejects project roots and extra fields', () => {
    expect(completedTaskViewSchema.safeParse({
      ...validCompletedTask,
      kind: 'project_root',
    }).success).toBe(false);
    expect(completedTaskViewSchema.safeParse({
      ...validCompletedTask,
      taskStatus: 'Completed',
    }).success).toBe(false);
  });
});
