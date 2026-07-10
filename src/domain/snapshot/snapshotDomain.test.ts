import { describe, expect, it } from 'vitest';
import { classifyAttentionReasons } from './attentionClassifier.js';
import { composeLeanSnapshot } from './leanSnapshotComposer.js';
import { mapRawLeanProject } from './leanProjectMapper.js';
import { mapRawLeanTask } from './leanTaskMapper.js';
import { adaptSnapshotProjectItem } from './snapshotProjectAdapter.js';
import { adaptSnapshotTaskItem } from './snapshotTaskAdapter.js';
import { compareCodeUnits } from './snapshotSorting.js';
import type { RawLeanProject, RawLeanTask } from './snapshotTypes.js';

const GENERATED_AT = '2026-07-10T12:00:00.000Z';
const EARLIER = '2026-07-09T12:00:00.000Z';
const LATER = '2026-07-11T12:00:00.000Z';
const FAR_LATER = '2026-07-12T12:00:00.000Z';

function rawTask(overrides: Partial<RawLeanTask> = {}): RawLeanTask {
  return {
    id: 'task-1',
    name: 'Task',
    hasNote: false,
    taskStatus: 'Available',
    flagged: false,
    effectiveFlagged: false,
    dueDate: null,
    effectiveDueDate: null,
    deferDate: null,
    effectiveDeferDate: null,
    plannedDate: null,
    effectivePlannedDate: null,
    tagNames: [],
    projectName: null,
    projectId: null,
    inInbox: false,
    isProjectRoot: false,
    hasChildren: false,
    creationDate: null,
    ...overrides,
  };
}

function rawProject(overrides: Partial<RawLeanProject> = {}): RawLeanProject {
  return {
    id: 'project-1',
    name: 'Project',
    hasNote: false,
    status: 'Active',
    sequential: false,
    flagged: false,
    containsSingletonActions: false,
    folderId: null,
    folderName: null,
    totalTaskCount: 0,
    taskStatusCounts: {
      available: 0,
      next: 0,
      blocked: 0,
      dueSoon: 0,
      overdue: 0,
      completed: 0,
      dropped: 0,
    },
    dueDate: null,
    effectiveDueDate: null,
    deferDate: null,
    effectiveDeferDate: null,
    ...overrides,
  };
}

describe('snapshotTaskAdapter', () => {
  it.each(['Available', 'Blocked', 'DueSoon', 'Next', 'Overdue'] as const)(
    'accepts active status %s',
    taskStatus => {
      const result = adaptSnapshotTaskItem(rawTask({ taskStatus }));
      expect(result.success).toBe(true);
    },
  );

  it('accepts an action group and strict booleans', () => {
    const result = adaptSnapshotTaskItem(rawTask({ hasChildren: true, hasNote: true }));
    expect(result).toEqual({ success: true, task: rawTask({ hasChildren: true, hasNote: true }) });
  });

  it('normalizes undefined nullable dates and project context to null', () => {
    const item = { ...rawTask() } as Record<string, unknown>;
    item.dueDate = undefined;
    item.effectiveDueDate = undefined;
    item.creationDate = undefined;
    item.projectId = undefined;
    item.projectName = undefined;
    const result = adaptSnapshotTaskItem(item);
    expect(result.success && result.task).toMatchObject({
      dueDate: null,
      effectiveDueDate: null,
      creationDate: null,
      projectId: null,
      projectName: null,
    });
  });

  it('accepts project and Inbox compatibility contexts', () => {
    expect(adaptSnapshotTaskItem(rawTask({ projectId: 'p1', projectName: 'P1' })).success).toBe(true);
    expect(adaptSnapshotTaskItem(rawTask({ projectName: 'Inbox', inInbox: true })).success).toBe(true);
  });

  it.each(['Completed', 'Dropped', 'Unknown'])('rejects non-active status %s', taskStatus => {
    expect(adaptSnapshotTaskItem({ ...rawTask(), taskStatus }).success).toBe(false);
  });

  it.each([
    ['id', ''],
    ['hasNote', 'false'],
    ['flagged', 1],
    ['tagNames', {}],
    ['dueDate', '2026-02-30T00:00:00Z'],
  ])('rejects invalid %s', (field, value) => {
    expect(adaptSnapshotTaskItem({ ...rawTask(), [field]: value }).success).toBe(false);
  });

  it('rejects missing required fields and invalid project pairs', () => {
    const missing = { ...rawTask() } as Record<string, unknown>;
    delete missing.hasChildren;
    expect(adaptSnapshotTaskItem(missing).success).toBe(false);
    expect(adaptSnapshotTaskItem(rawTask({ projectId: 'p1', projectName: null })).success).toBe(false);
    expect(adaptSnapshotTaskItem(rawTask({ projectName: 'Other' })).success).toBe(false);
  });
});

describe('snapshotProjectAdapter', () => {
  it('accepts Active project facts without requiring count sums', () => {
    const project = rawProject({
      hasNote: true,
      sequential: true,
      flagged: true,
      totalTaskCount: 9,
      taskStatusCounts: { ...rawProject().taskStatusCounts, available: 1 },
    });
    expect(adaptSnapshotProjectItem(project)).toEqual({ success: true, project });
  });

  it('accepts a folder pair and null folder pair', () => {
    expect(adaptSnapshotProjectItem(rawProject({ folderId: 'f1', folderName: 'Folder' })).success).toBe(true);
    expect(adaptSnapshotProjectItem(rawProject()).success).toBe(true);
  });

  it.each(['OnHold', 'Done', 'Dropped'] as const)('validates known status %s at Adapter layer', status => {
    expect(adaptSnapshotProjectItem(rawProject({ status })).success).toBe(true);
  });

  it.each([
    ['hasNote', 'true'],
    ['status', 'Unknown'],
    ['sequential', 0],
    ['totalTaskCount', -1],
    ['totalTaskCount', 1.5],
    ['dueDate', 'invalid'],
  ])('rejects invalid %s', (field, value) => {
    expect(adaptSnapshotProjectItem({ ...rawProject(), [field]: value }).success).toBe(false);
  });

  it('rejects folder pair and task status count violations', () => {
    expect(adaptSnapshotProjectItem(rawProject({ folderId: 'f1' })).success).toBe(false);
    expect(adaptSnapshotProjectItem(rawProject({ folderName: 'Folder' })).success).toBe(false);
    expect(adaptSnapshotProjectItem(rawProject({
      taskStatusCounts: { ...rawProject().taskStatusCounts, blocked: -1 },
    })).success).toBe(false);
    expect(adaptSnapshotProjectItem(rawProject({
      taskStatusCounts: { ...rawProject().taskStatusCounts, dueSoon: 1.5 },
    })).success).toBe(false);
  });
});

describe('Lean mappers reuse shared semantics', () => {
  it('maps action, action group, project context, tags, dates, and flag semantics', () => {
    const mapped = mapRawLeanTask(rawTask({
      hasChildren: true,
      projectId: 'p1',
      projectName: 'Project',
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      plannedDate: null,
      effectivePlannedDate: EARLIER,
      deferDate: null,
      effectiveDeferDate: LATER,
      flagged: false,
      effectiveFlagged: true,
      tagNames: ['Work', 'Review'],
    }));
    expect(mapped).toMatchObject({
      kind: 'action_group',
      project: { id: 'p1', name: 'Project' },
      dates: {
        due: { source: 'direct' },
        planned: { source: 'inherited' },
        defer: { source: 'inherited' },
      },
      flagged: { direct: false, effective: true, source: 'inherited' },
      tags: ['Work', 'Review'],
    });
  });

  it('rejects project roots from Lean Task output', () => {
    expect(() => mapRawLeanTask(rawTask({ isProjectRoot: true }))).toThrow(/Project root/);
  });

  it('maps Active standard and single-actions projects', () => {
    expect(mapRawLeanProject(rawProject()).kind).toBe('standard');
    expect(mapRawLeanProject(rawProject({ containsSingletonActions: true })).kind).toBe('single_actions');
  });

  it('maps folder, dates, counts, and compact Active status', () => {
    const mapped = mapRawLeanProject(rawProject({
      folderId: 'f1',
      folderName: 'Folder',
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      deferDate: null,
      effectiveDeferDate: LATER,
      totalTaskCount: 3,
    }));
    expect(mapped.status).toBe('Active');
    expect(mapped.folder).toEqual({ id: 'f1', name: 'Folder' });
    expect(mapped.dates.due.source).toBe('direct');
    expect(mapped.dates.defer.source).toBe('inherited');
    expect(mapped.tasks.total).toBe(3);
  });

  it('rejects non-Active projects at Domain mapping', () => {
    expect(() => mapRawLeanProject(rawProject({ status: 'OnHold' }))).toThrow(/Active/);
  });
});

describe('attentionClassifier', () => {
  it.each([
    [rawTask({ taskStatus: 'Overdue' }), ['overdue']],
    [rawTask({ taskStatus: 'DueSoon' }), ['dueSoon']],
    [rawTask({ plannedDate: EARLIER, effectivePlannedDate: EARLIER }), ['planned']],
    [rawTask({ plannedDate: null, effectivePlannedDate: EARLIER }), ['planned']],
    [rawTask({ effectivePlannedDate: GENERATED_AT }), ['planned']],
    [rawTask({ effectivePlannedDate: LATER }), []],
    [rawTask({ taskStatus: 'Blocked', effectivePlannedDate: EARLIER }), []],
    [rawTask({ taskStatus: 'Blocked', plannedDate: EARLIER, effectivePlannedDate: EARLIER }), []],
    [rawTask({ effectiveFlagged: true }), ['flagged']],
  ] as const)('classifies fixed reasons for fixture %#', (task, reasons) => {
    expect(classifyAttentionReasons(task, GENERATED_AT)).toEqual(reasons);
  });

  it('preserves fixed multi-reason order and never adds blocked', () => {
    const task = rawTask({
      taskStatus: 'Overdue',
      effectivePlannedDate: EARLIER,
      effectiveFlagged: true,
    });
    expect(classifyAttentionReasons(task, GENERATED_AT)).toEqual([
      'overdue',
      'planned',
      'flagged',
    ]);
    expect(classifyAttentionReasons(rawTask({ taskStatus: 'Blocked' }), GENERATED_AT)).toEqual([]);
  });
});

describe('snapshot sorting and composition', () => {
  it('uses deterministic UTF-16 code-unit ordering', () => {
    expect(['b', 'A', 'a'].sort(compareCodeUnits)).toEqual(['A', 'a', 'b']);
  });

  it('sorts root projects before folder projects and applies stable ties', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      tasks: [],
      projects: [
        rawProject({ id: 'p3', name: 'A', folderId: 'f2', folderName: 'Folder' }),
        rawProject({ id: 'p2', name: 'B' }),
        rawProject({ id: 'p1', name: 'A' }),
        rawProject({ id: 'p4', name: 'A', folderId: 'f1', folderName: 'Folder' }),
      ],
    });
    expect(snapshot.projects.active.items.map(project => project.id)).toEqual(['p1', 'p2', 'p4', 'p3']);
  });

  it('sorts Inbox by creation date with null last, then name and id', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [
        rawTask({ id: 't3', name: 'A', inInbox: true, creationDate: null }),
        rawTask({ id: 't2', name: 'B', inInbox: true, creationDate: EARLIER }),
        rawTask({ id: 't1', name: 'A', inInbox: true, creationDate: EARLIER }),
      ],
    });
    expect(snapshot.inbox.items.map(task => task.id)).toEqual(['t1', 't2', 't3']);
  });

  it('sorts direct due before inherited due before comparing effective dates', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [
        rawTask({ id: 'inherited', taskStatus: 'Overdue', effectiveDueDate: '2026-07-01T00:00:00Z' }),
        rawTask({ id: 'direct', taskStatus: 'Overdue', dueDate: EARLIER, effectiveDueDate: EARLIER }),
      ],
    });
    expect(snapshot.attention.items.map(item => item.task.id)).toEqual(['direct', 'inherited']);
  });

  it('sorts direct planned before inherited planned', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [
        rawTask({ id: 'inherited', effectivePlannedDate: '2026-07-01T00:00:00Z' }),
        rawTask({ id: 'direct', plannedDate: EARLIER, effectivePlannedDate: EARLIER }),
      ],
    });
    expect(snapshot.attention.items.map(item => item.task.id)).toEqual(['direct', 'inherited']);
  });

  it('sorts flagged tasks by planned date, then due date, then name and id', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [
        rawTask({ id: 'no-date', name: 'A', effectiveFlagged: true }),
        rawTask({ id: 'later-planned', effectiveFlagged: true, effectivePlannedDate: FAR_LATER }),
        rawTask({ id: 'earlier-planned', effectiveFlagged: true, effectivePlannedDate: LATER }),
        rawTask({ id: 'due-only', effectiveFlagged: true, effectiveDueDate: EARLIER }),
      ],
    });
    expect(snapshot.attention.items.map(item => item.task.id)).toEqual([
      'earlier-planned',
      'later-planned',
      'due-only',
      'no-date',
    ]);
  });

  it('deduplicates attention reasons, counts before cap, and allows Inbox overlap', () => {
    const multi = rawTask({
      id: 'multi',
      inInbox: true,
      taskStatus: 'Overdue',
      effectivePlannedDate: EARLIER,
      effectiveFlagged: true,
      creationDate: EARLIER,
    });
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 1,
      projects: [rawProject({ id: 'p2', name: 'B' }), rawProject({ id: 'p1', name: 'A' })],
      tasks: [multi, rawTask({ id: 'flag', effectiveFlagged: true })],
    });
    expect(snapshot.attention.total).toBe(2);
    expect(snapshot.attention.returned).toBe(1);
    expect(snapshot.attention.truncated).toBe(true);
    expect(snapshot.attention.byReason).toEqual({ overdue: 1, dueSoon: 0, planned: 1, flagged: 2 });
    expect(snapshot.attention.items[0].reasons).toEqual(['overdue', 'planned', 'flagged']);
    expect(snapshot.inbox.items[0].id).toBe('multi');
    expect(snapshot.projects.active).toMatchObject({ total: 2, returned: 1, truncated: true });
  });

  it('caps Inbox after stable sorting while preserving full totals', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 1,
      projects: [],
      tasks: [
        rawTask({ id: 'newer', inInbox: true, creationDate: GENERATED_AT }),
        rawTask({ id: 'older', inInbox: true, creationDate: EARLIER }),
      ],
    });
    expect(snapshot.inbox).toMatchObject({ total: 2, returned: 1, truncated: true });
    expect(snapshot.inbox.items[0].id).toBe('older');
  });

  it('excludes project roots from Attention and Inbox', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [rawTask({ isProjectRoot: true, inInbox: true, effectiveFlagged: true })],
    });
    expect(snapshot.attention.total).toBe(0);
    expect(snapshot.inbox.total).toBe(0);
  });

  it('returns a stable empty snapshot without internal fields', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      tasks: [],
      projects: [],
    });
    expect(snapshot).toMatchObject({
      generatedAt: GENERATED_AT,
      scope: 'all',
      projects: { active: { total: 0, returned: 0, truncated: false, items: [] } },
      attention: { total: 0, returned: 0, truncated: false, items: [] },
      inbox: { total: 0, returned: 0, truncated: false, items: [] },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/"raw"|"note"|"waiting"|"recentCompletions"/);
  });

  it('rejects invalid composer invariants', () => {
    expect(() => composeLeanSnapshot({
      generatedAt: 'invalid',
      limitPerSection: 1,
      tasks: [],
      projects: [],
    })).toThrow(/generatedAt/);
    expect(() => composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 0,
      tasks: [],
      projects: [],
    })).toThrow(/limitPerSection/);
    expect(() => composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 101,
      tasks: [],
      projects: [],
    })).toThrow(/limitPerSection/);
    expect(() => composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 1,
      tasks: [rawTask(), rawTask()],
      projects: [],
    })).toThrow(/unique/);
  });
});
