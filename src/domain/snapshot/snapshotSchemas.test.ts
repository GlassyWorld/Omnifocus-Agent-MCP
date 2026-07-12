import { describe, expect, it } from 'vitest';
import type {
  LeanProjectSummary,
  LeanSnapshotView,
  LeanTaskSummary,
} from './snapshotTypes.js';
import {
  getLeanSnapshotSuccessSchema,
  leanSnapshotViewSchema,
} from './snapshotSchemas.js';

const emptyCounts = {
  available: 0,
  next: 0,
  blocked: 0,
  dueSoon: 0,
  overdue: 0,
  completed: 0,
  dropped: 0,
};

const noDate = { direct: null, effective: null, source: 'none' as const };

const task: LeanTaskSummary = {
  id: 'task-1',
  name: 'Task',
  hasNote: false,
  kind: 'action',
  project: null,
  location: { inInbox: true },
  status: { taskStatus: 'Available' },
  dates: { due: noDate, planned: noDate, defer: noDate },
  flagged: { direct: false, effective: true, source: 'inherited' },
  tags: [],
};

const project: LeanProjectSummary = {
  id: 'project-1',
  name: 'Project',
  hasNote: false,
  kind: 'standard',
  status: 'Active',
  folder: null,
  sequential: false,
  flagged: false,
  dates: { due: noDate, planned: noDate, defer: noDate },
  tasks: { total: 0, byStatus: emptyCounts },
};

const snapshot: LeanSnapshotView = {
  generatedAt: '2026-07-10T12:00:00.000Z',
  scope: 'all',
  projects: {
    active: { total: 1, returned: 1, truncated: false, items: [project] },
    planned: { total: 0, returned: 0, truncated: false, items: [] },
    deadline: {
      total: 1,
      returned: 1,
      truncated: false,
      items: [{ project, state: 'dueSoon' }],
    },
  },
  attention: {
    total: 1,
    returned: 1,
    truncated: false,
    byReason: { overdue: 0, dueSoon: 0, planned: 0, flagged: 1 },
    items: [{ task, reasons: ['flagged'] }],
  },
  inbox: { total: 1, returned: 1, truncated: false, items: [task] },
};

describe('LeanSnapshotView output schema', () => {
  it('validates all sections and deep Project/Task summaries', () => {
    expect(leanSnapshotViewSchema.parse(snapshot)).toEqual(snapshot);
    expect(getLeanSnapshotSuccessSchema.safeParse({ success: true, snapshot }).success).toBe(true);
  });

  it('requires fixed attention count keys and section fields', () => {
    const { flagged: _flagged, ...incompleteByReason } = snapshot.attention.byReason;
    expect(leanSnapshotViewSchema.safeParse({
      ...snapshot,
      attention: { ...snapshot.attention, byReason: incompleteByReason },
    }).success).toBe(false);
    const { returned: _returned, ...incompleteInbox } = snapshot.inbox;
    expect(leanSnapshotViewSchema.safeParse({
      ...snapshot,
      inbox: incompleteInbox,
    }).success).toBe(false);
  });

  it('rejects invalid deep enums, dates, and extra fields', () => {
    expect(leanSnapshotViewSchema.safeParse({
      ...snapshot,
      inbox: {
        ...snapshot.inbox,
        items: [{ ...task, status: { taskStatus: 'Completed' } }],
      },
    }).success).toBe(false);
    expect(leanSnapshotViewSchema.safeParse({
      ...snapshot,
      generatedAt: '2026-07-10',
    }).success).toBe(false);
    expect(leanSnapshotViewSchema.safeParse({ ...snapshot, recommendations: [] }).success).toBe(false);
  });
});
