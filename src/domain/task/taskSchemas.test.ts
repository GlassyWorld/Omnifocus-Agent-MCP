import { describe, expect, it } from 'vitest';
import type { TaskView } from './taskTypes.js';
import { getTaskSuccessSchema, taskViewSchema } from './taskSchemas.js';

const validTaskView: TaskView = {
  id: 'task-1',
  name: 'Task',
  note: '',
  kind: 'action',
  status: {
    taskStatus: 'Available',
    completion: { direct: false, directDate: null, effectiveDate: null, source: 'none' },
    drop: { direct: false, directDate: null, effectiveDate: null, source: 'none' },
    flagged: { direct: false, effective: false, source: 'none' },
  },
  dates: {
    due: { direct: null, effective: null, source: 'none' },
    planned: { direct: null, effective: null, source: 'none' },
    defer: { direct: null, effective: null, source: 'none' },
  },
  project: null,
  location: { inInbox: true },
  hierarchy: {
    parentId: null,
    childIds: [],
    hasChildren: false,
    sequential: false,
    completedByChildren: false,
  },
  tags: [],
  repeat: { isRepeating: false, rule: null },
  estimate: { minutes: null },
  timestamps: { created: null, modified: null },
};

describe('TaskView output schema', () => {
  it('accepts a complete mapped TaskView with nullable context', () => {
    expect(taskViewSchema.parse(validTaskView)).toEqual(validTaskView);
    expect(getTaskSuccessSchema.safeParse({ success: true, task: validTaskView }).success).toBe(true);
  });

  it('rejects a missing required nested field', () => {
    const { childIds: _childIds, ...incompleteHierarchy } = validTaskView.hierarchy;
    expect(taskViewSchema.safeParse({
      ...validTaskView,
      hierarchy: incompleteHierarchy,
    }).success).toBe(false);
  });

  it('rejects invalid frozen enums and extra fields', () => {
    expect(taskViewSchema.safeParse({ ...validTaskView, kind: 'project' }).success).toBe(false);
    expect(taskViewSchema.safeParse({
      ...validTaskView,
      dates: {
        ...validTaskView.dates,
        due: { ...validTaskView.dates.due, source: 'container' },
      },
    }).success).toBe(false);
    expect(taskViewSchema.safeParse({ ...validTaskView, raw: {} }).success).toBe(false);
  });
});
