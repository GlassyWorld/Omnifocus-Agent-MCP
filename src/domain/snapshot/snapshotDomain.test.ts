import { describe, expect, it } from 'vitest';
import { classifyAttentionReasons } from './attentionClassifier.js';
import { composeLeanSnapshot } from './leanSnapshotComposer.js';
import { mapRawLeanProject } from './leanProjectMapper.js';
import { mapRawLeanTask } from './leanTaskMapper.js';
import { classifyProjectDeadline } from './projectDeadlineClassifier.js';
import { isProjectPlannedReady } from './projectPlannedClassifier.js';
import { resolveProjectRootSemantics } from './snapshotProjectRootSemanticsResolver.js';
import { adaptSnapshotProjectItem } from './snapshotProjectAdapter.js';
import { adaptSnapshotTaskItem } from './snapshotTaskAdapter.js';
import { compareCodeUnits } from './snapshotSorting.js';
import type { DateSemantics } from '../task/taskTypes.js';
import type { RawLeanProject, RawLeanTask } from './snapshotTypes.js';

const GENERATED_AT = '2026-07-10T12:00:00.000Z';
const EARLIER = '2026-07-09T12:00:00.000Z';
const LATER = '2026-07-11T12:00:00.000Z';
const FAR_LATER = '2026-07-12T12:00:00.000Z';
const NO_DATE: DateSemantics = { direct: null, effective: null, source: 'none' };

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

function projectRoot(
  project: RawLeanProject,
  overrides: Partial<RawLeanTask> = {},
): RawLeanTask {
  return rawTask({
    id: project.id,
    name: project.name,
    taskStatus: 'Blocked',
    isProjectRoot: true,
    hasChildren: true,
    ...overrides,
  });
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
    expect(mapRawLeanProject(rawProject(), NO_DATE).kind).toBe('standard');
    expect(mapRawLeanProject(
      rawProject({ containsSingletonActions: true }),
      NO_DATE,
    ).kind).toBe('single_actions');
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
    }), { direct: EARLIER, effective: EARLIER, source: 'direct' });
    expect(mapped.status).toBe('Active');
    expect(mapped.folder).toEqual({ id: 'f1', name: 'Folder' });
    expect(mapped.dates.due.source).toBe('direct');
    expect(mapped.dates.planned).toEqual({
      direct: EARLIER,
      effective: EARLIER,
      source: 'direct',
    });
    expect(mapped.dates.defer.source).toBe('inherited');
    expect(mapped.tasks.total).toBe(3);
  });

  it('rejects non-Active projects at Domain mapping', () => {
    expect(() => mapRawLeanProject(rawProject({ status: 'OnHold' }), NO_DATE)).toThrow(/Active/);
  });
});

describe('attentionClassifier', () => {
  it.each([
    [rawTask({ taskStatus: 'Overdue', dueDate: EARLIER, effectiveDueDate: EARLIER }), ['overdue']],
    [rawTask({ taskStatus: 'DueSoon', dueDate: LATER, effectiveDueDate: LATER }), ['dueSoon']],
    [rawTask({ taskStatus: 'Overdue', effectiveDueDate: EARLIER }), []],
    [rawTask({ taskStatus: 'DueSoon', effectiveDueDate: LATER }), []],
    [rawTask({ plannedDate: EARLIER, effectivePlannedDate: EARLIER }), ['planned']],
    [rawTask({ plannedDate: GENERATED_AT, effectivePlannedDate: GENERATED_AT }), ['planned']],
    [rawTask({ plannedDate: LATER, effectivePlannedDate: LATER }), []],
    [rawTask({ plannedDate: null, effectivePlannedDate: EARLIER }), []],
    [rawTask({ taskStatus: 'Blocked', effectivePlannedDate: EARLIER }), []],
    [rawTask({ taskStatus: 'Blocked', plannedDate: EARLIER, effectivePlannedDate: EARLIER }), []],
    [rawTask({ effectiveFlagged: true }), ['flagged']],
  ] as const)('classifies fixed reasons for fixture %#', (task, reasons) => {
    expect(classifyAttentionReasons(task, GENERATED_AT)).toEqual(reasons);
  });

  it('preserves fixed multi-reason order and never adds blocked', () => {
    const task = rawTask({
      taskStatus: 'Overdue',
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      plannedDate: EARLIER,
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

  it('does not add planned to inherited tasks with another reason', () => {
    expect(classifyAttentionReasons(rawTask({
      effectivePlannedDate: EARLIER,
      effectiveFlagged: true,
    }), GENERATED_AT)).toEqual(['flagged']);
    expect(classifyAttentionReasons(rawTask({
      taskStatus: 'Overdue',
      effectiveDueDate: EARLIER,
      effectivePlannedDate: EARLIER,
    }), GENERATED_AT)).toEqual([]);
  });

  it('allows a direct-planned Action Group exactly once', () => {
    expect(classifyAttentionReasons(rawTask({
      hasChildren: true,
      plannedDate: EARLIER,
      effectivePlannedDate: EARLIER,
      effectiveFlagged: true,
    }), GENERATED_AT)).toEqual(['planned', 'flagged']);
    expect(classifyAttentionReasons(rawTask({
      hasChildren: true,
      plannedDate: null,
      effectivePlannedDate: EARLIER,
    }), GENERATED_AT)).toEqual([]);
  });

  it.each([
    [false, 'DueSoon', true, ['dueSoon']],
    [false, 'DueSoon', false, []],
    [false, 'Overdue', true, ['overdue']],
    [false, 'Overdue', false, []],
    [true, 'DueSoon', true, ['dueSoon']],
    [true, 'DueSoon', false, []],
    [true, 'Overdue', true, ['overdue']],
    [true, 'Overdue', false, []],
  ] as const)(
    'classifies direct-only Due owner for hasChildren=%s status=%s direct=%s',
    (hasChildren, taskStatus, direct, reasons) => {
      expect(classifyAttentionReasons(rawTask({
        hasChildren,
        taskStatus,
        dueDate: direct ? EARLIER : null,
        effectiveDueDate: EARLIER,
      }), GENERATED_AT)).toEqual(reasons);
    },
  );

  it('keeps non-Due reasons independent from inherited Due status', () => {
    expect(classifyAttentionReasons(rawTask({
      taskStatus: 'DueSoon',
      effectiveDueDate: EARLIER,
      effectiveFlagged: true,
    }), GENERATED_AT)).toEqual(['flagged']);
    expect(classifyAttentionReasons(rawTask({
      taskStatus: 'Overdue',
      effectiveDueDate: EARLIER,
      plannedDate: EARLIER,
      effectivePlannedDate: EARLIER,
    }), GENERATED_AT)).toEqual(['planned']);
  });

  it('preserves mixed reason order for direct Due owners', () => {
    expect(classifyAttentionReasons(rawTask({
      taskStatus: 'DueSoon',
      hasChildren: true,
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      effectiveFlagged: true,
    }), GENERATED_AT)).toEqual(['dueSoon', 'flagged']);
    expect(classifyAttentionReasons(rawTask({
      taskStatus: 'Overdue',
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      plannedDate: EARLIER,
      effectivePlannedDate: EARLIER,
      effectiveFlagged: true,
    }), GENERATED_AT)).toEqual(['overdue', 'planned', 'flagged']);
  });
});

describe('Project root semantics resolver and classifiers', () => {
  it('joins the canonical Project ID and preserves Planned, Due, and native status', () => {
    const project = rawProject({ id: 'p1' });
    const resolved = resolveProjectRootSemantics([
      projectRoot(project, {
        taskStatus: 'DueSoon',
        plannedDate: EARLIER,
        effectivePlannedDate: LATER,
        dueDate: LATER,
        effectiveDueDate: LATER,
      }),
    ], [project]);
    expect(resolved.get('p1')).toEqual({
      planned: { direct: EARLIER, effective: LATER, source: 'direct' },
      due: { direct: LATER, effective: LATER, source: 'direct' },
      taskStatus: 'DueSoon',
    });
  });

  it('rejects missing, wrong-kind, and duplicate roots', () => {
    const project = rawProject({ id: 'p1' });
    expect(() => resolveProjectRootSemantics([], [project])).toThrow(/Missing Project root/);
    expect(() => resolveProjectRootSemantics([
      rawTask({ id: 'p1', isProjectRoot: false }),
    ], [project])).toThrow(/Missing Project root/);
    expect(() => resolveProjectRootSemantics([
      projectRoot(project),
      projectRoot(project),
    ], [project])).toThrow(/Duplicate Project root/);
  });

  it.each([
    [{ direct: EARLIER, effective: EARLIER, source: 'direct' }, true],
    [{ direct: GENERATED_AT, effective: GENERATED_AT, source: 'direct' }, true],
    [{ direct: LATER, effective: LATER, source: 'direct' }, false],
    [{ direct: null, effective: EARLIER, source: 'inherited' }, false],
    [NO_DATE, false],
  ] as const)('classifies Project Planned fixture %#', (planned, expected) => {
    const project = mapRawLeanProject(rawProject(), planned);
    expect(isProjectPlannedReady(project, GENERATED_AT)).toBe(expected);
  });

  it.each([
    ['DueSoon', 'dueSoon'],
    ['Overdue', 'overdue'],
    ['Available', null],
    ['Next', null],
    ['Blocked', null],
  ] as const)('classifies direct Project Due with native root status %s', (taskStatus, expected) => {
    const project = mapRawLeanProject(rawProject({
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
    }), NO_DATE);
    expect(classifyProjectDeadline(project, {
      planned: NO_DATE,
      due: { direct: EARLIER, effective: EARLIER, source: 'direct' },
      taskStatus,
    })).toBe(expected);
  });

  it('does not infer Project deadline state from dates or inherited Due', () => {
    const directProject = mapRawLeanProject(rawProject({
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
    }), NO_DATE);
    expect(classifyProjectDeadline(directProject, {
      planned: NO_DATE,
      due: { direct: EARLIER, effective: EARLIER, source: 'direct' },
      taskStatus: 'Blocked',
    })).toBeNull();

    const inheritedProject = mapRawLeanProject(rawProject({ effectiveDueDate: EARLIER }), NO_DATE);
    expect(classifyProjectDeadline(inheritedProject, {
      planned: NO_DATE,
      due: { direct: null, effective: EARLIER, source: 'inherited' },
      taskStatus: 'DueSoon',
    })).toBeNull();

    const noDueProject = mapRawLeanProject(rawProject(), NO_DATE);
    expect(classifyProjectDeadline(noDueProject, {
      planned: NO_DATE,
      due: NO_DATE,
      taskStatus: 'DueSoon',
    })).toBeNull();
  });

  it.each([
    [{ direct: LATER, effective: EARLIER, source: 'direct' }],
    [{ direct: EARLIER, effective: LATER, source: 'direct' }],
    [{ direct: EARLIER, effective: EARLIER, source: 'inherited' }],
  ] as const)('rejects Project/root Due mismatch %#', rootDue => {
    const project = mapRawLeanProject(rawProject({
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
    }), NO_DATE);
    expect(() => classifyProjectDeadline(project, {
      planned: NO_DATE,
      due: rootDue,
      taskStatus: 'DueSoon',
    })).toThrow(/Due semantics mismatch/);
  });
});

describe('snapshot sorting and composition', () => {
  it('uses deterministic UTF-16 code-unit ordering', () => {
    expect(['b', 'A', 'a'].sort(compareCodeUnits)).toEqual(['A', 'a', 'b']);
  });

  it('sorts root projects before folder projects and applies stable ties', () => {
    const projects = [
      rawProject({ id: 'p3', name: 'A', folderId: 'f2', folderName: 'Folder' }),
      rawProject({ id: 'p2', name: 'B' }),
      rawProject({ id: 'p1', name: 'A' }),
      rawProject({ id: 'p4', name: 'A', folderId: 'f1', folderName: 'Folder' }),
    ];
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      tasks: projects.map(project => projectRoot(project)),
      projects,
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

  it('sorts direct Due Attention by direct date, then name and id', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [
        rawTask({
          id: 'later',
          taskStatus: 'Overdue',
          dueDate: EARLIER,
          effectiveDueDate: EARLIER,
        }),
        rawTask({
          id: 'earlier',
          taskStatus: 'Overdue',
          dueDate: '2026-07-01T00:00:00Z',
          effectiveDueDate: '2026-07-01T00:00:00Z',
        }),
      ],
    });
    expect(snapshot.attention.items.map(item => item.task.id)).toEqual(['earlier', 'later']);
  });

  it('sorts direct-planned owners by direct date and excludes inherited-only tasks', () => {
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects: [],
      tasks: [
        rawTask({ id: 'inherited', effectivePlannedDate: '2026-07-01T00:00:00Z' }),
        rawTask({ id: 'later-direct', plannedDate: EARLIER, effectivePlannedDate: EARLIER }),
        rawTask({
          id: 'earlier-direct',
          plannedDate: '2026-07-08T12:00:00.000Z',
          effectivePlannedDate: '2026-07-08T12:00:00.000Z',
        }),
      ],
    });
    expect(snapshot.attention.items.map(item => item.task.id)).toEqual([
      'earlier-direct',
      'later-direct',
    ]);
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
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      plannedDate: EARLIER,
      effectivePlannedDate: EARLIER,
      effectiveFlagged: true,
      creationDate: EARLIER,
    });
    const projects = [rawProject({ id: 'p2', name: 'B' }), rawProject({ id: 'p1', name: 'A' })];
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 1,
      projects,
      tasks: [
        multi,
        rawTask({ id: 'flag', effectiveFlagged: true }),
        ...projects.map(project => projectRoot(project)),
      ],
    });
    expect(snapshot.attention.total).toBe(2);
    expect(snapshot.attention.returned).toBe(1);
    expect(snapshot.attention.truncated).toBe(true);
    expect(snapshot.attention.byReason).toEqual({ overdue: 1, dueSoon: 0, planned: 1, flagged: 2 });
    expect(snapshot.attention.items[0].reasons).toEqual(['overdue', 'planned', 'flagged']);
    expect(snapshot.inbox.items[0].id).toBe('multi');
    expect(snapshot.projects.active).toMatchObject({ total: 2, returned: 1, truncated: true });
  });

  it('represents a direct-planned workflow once without inherited child fan-out', () => {
    const project = rawProject({
      id: 'weekly',
      name: 'Weekly Review',
      totalTaskCount: 8,
      taskStatusCounts: {
        ...rawProject().taskStatusCounts,
        available: 7,
        next: 1,
      },
    });
    const children = Array.from({ length: 8 }, (_, index) => rawTask({
      id: `weekly-child-${index}`,
      name: `Child ${index}`,
      taskStatus: index === 7 ? 'Next' : 'Available',
      projectId: project.id,
      projectName: project.name,
      effectivePlannedDate: EARLIER,
    }));
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects: [project],
      tasks: [
        projectRoot(project, {
          taskStatus: 'Blocked',
          plannedDate: EARLIER,
          effectivePlannedDate: EARLIER,
        }),
        ...children,
      ],
    });

    expect(snapshot.projects.active.items.map(item => item.id)).toEqual(['weekly']);
    expect(snapshot.projects.planned).toMatchObject({
      total: 1,
      returned: 1,
      truncated: false,
    });
    expect(snapshot.projects.planned.items.map(item => item.id)).toEqual(['weekly']);
    expect(snapshot.projects.planned.items[0].dates.planned).toEqual({
      direct: EARLIER,
      effective: EARLIER,
      source: 'direct',
    });
    expect(snapshot.attention.total).toBe(0);
    expect(snapshot.attention.byReason.planned).toBe(0);
    expect(snapshot.attention.items.flatMap(item => item.reasons)).not.toContain('planned');
  });

  it('prevents Daily Reset-style inherited Planned fan-out', () => {
    const project = rawProject({ id: 'daily', name: 'Daily Reset' });
    const children = Array.from({ length: 6 }, (_, index) => rawTask({
      id: `daily-child-${index}`,
      taskStatus: index === 5 ? 'Next' : 'Available',
      projectId: project.id,
      projectName: project.name,
      effectivePlannedDate: EARLIER,
    }));
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects: [project],
      tasks: [
        projectRoot(project, {
          plannedDate: GENERATED_AT,
          effectivePlannedDate: GENERATED_AT,
        }),
        ...children,
      ],
    });
    expect(snapshot.projects.planned.items.map(item => item.id)).toEqual(['daily']);
    expect(snapshot.attention.byReason.planned).toBe(0);
  });

  it('represents Weekly Review direct DueSoon once without inherited child fan-out', () => {
    const project = rawProject({
      id: 'weekly',
      name: 'Weekly Review',
      dueDate: LATER,
      effectiveDueDate: LATER,
      totalTaskCount: 8,
      taskStatusCounts: {
        ...rawProject().taskStatusCounts,
        available: 0,
        dueSoon: 8,
      },
    });
    const children = Array.from({ length: 8 }, (_, index) => rawTask({
      id: `weekly-due-child-${index}`,
      name: `Child ${index}`,
      taskStatus: 'DueSoon',
      projectId: project.id,
      projectName: project.name,
      effectiveDueDate: LATER,
      effectivePlannedDate: EARLIER,
    }));
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects: [project],
      tasks: [
        projectRoot(project, {
          taskStatus: 'DueSoon',
          dueDate: LATER,
          effectiveDueDate: LATER,
          plannedDate: EARLIER,
          effectivePlannedDate: EARLIER,
        }),
        ...children,
      ],
    });

    expect(snapshot.projects.active.items.map(item => item.id)).toEqual(['weekly']);
    expect(snapshot.projects.planned.items.map(item => item.id)).toEqual(['weekly']);
    expect(snapshot.projects.deadline).toMatchObject({ total: 1, returned: 1, truncated: false });
    expect(snapshot.projects.deadline.items).toEqual([{
      project: snapshot.projects.active.items[0],
      state: 'dueSoon',
    }]);
    expect(snapshot.projects.deadline.items[0].project.tasks).toEqual({
      total: 8,
      byStatus: project.taskStatusCounts,
    });
    expect(snapshot.attention).toMatchObject({
      total: 0,
      byReason: { overdue: 0, dueSoon: 0, planned: 0, flagged: 0 },
    });
  });

  it('represents a direct Project Overdue once without inherited child fan-out', () => {
    const project = rawProject({
      id: 'overdue-project',
      dueDate: EARLIER,
      effectiveDueDate: EARLIER,
      totalTaskCount: 8,
      taskStatusCounts: {
        ...rawProject().taskStatusCounts,
        available: 0,
        overdue: 8,
      },
    });
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects: [project],
      tasks: [
        projectRoot(project, {
          taskStatus: 'Overdue',
          dueDate: EARLIER,
          effectiveDueDate: EARLIER,
        }),
        ...Array.from({ length: 8 }, (_, index) => rawTask({
          id: `overdue-child-${index}`,
          taskStatus: 'Overdue',
          projectId: project.id,
          projectName: project.name,
          effectiveDueDate: EARLIER,
        })),
      ],
    });

    expect(snapshot.projects.deadline.items.map(item => ({
      id: item.project.id,
      state: item.state,
    }))).toEqual([{ id: project.id, state: 'overdue' }]);
    expect(snapshot.attention.total).toBe(0);
    expect(snapshot.attention.byReason.overdue).toBe(0);
  });

  it('preserves nested direct Due owners by identity without timestamp deduplication', () => {
    const project = rawProject({
      id: 'nested-project',
      dueDate: LATER,
      effectiveDueDate: LATER,
    });
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects: [project],
      tasks: [
        projectRoot(project, {
          taskStatus: 'DueSoon',
          dueDate: LATER,
          effectiveDueDate: LATER,
        }),
        rawTask({
          id: 'group-owner',
          name: 'Group',
          hasChildren: true,
          taskStatus: 'DueSoon',
          dueDate: LATER,
          effectiveDueDate: LATER,
          projectId: project.id,
          projectName: project.name,
        }),
        rawTask({
          id: 'leaf-owner',
          name: 'Leaf',
          taskStatus: 'DueSoon',
          dueDate: LATER,
          effectiveDueDate: LATER,
          projectId: project.id,
          projectName: project.name,
        }),
        rawTask({
          id: 'inherited-child',
          taskStatus: 'DueSoon',
          effectiveDueDate: LATER,
          projectId: project.id,
          projectName: project.name,
        }),
      ],
    });

    expect(snapshot.projects.deadline.items.map(item => item.project.id)).toEqual([project.id]);
    expect(snapshot.attention.items.map(item => item.task.id)).toEqual(['group-owner', 'leaf-owner']);
    expect(snapshot.attention.items.map(item => item.task.kind)).toEqual(['action_group', 'action']);
    expect(snapshot.attention.byReason.dueSoon).toBe(2);
  });

  it('derives planned Projects from the full Active set before independent truncation', () => {
    const projects = Array.from({ length: 30 }, (_, index) => rawProject({
      id: `p-${String(index).padStart(2, '0')}`,
      name: `Project ${String(index).padStart(2, '0')}`,
    }));
    const plannedId = 'p-29';
    const tasks = projects.map(project => projectRoot(project, project.id === plannedId
      ? { plannedDate: EARLIER, effectivePlannedDate: EARLIER }
      : {}));
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects,
      tasks,
    });

    expect(snapshot.projects.active).toMatchObject({ total: 30, returned: 25, truncated: true });
    expect(snapshot.projects.active.items.map(item => item.id)).not.toContain(plannedId);
    expect(snapshot.projects.planned).toMatchObject({ total: 1, returned: 1, truncated: false });
    expect(snapshot.projects.planned.items.map(item => item.id)).toEqual([plannedId]);
  });

  it('derives deadline Projects from the full Active set before independent truncation', () => {
    const projects = Array.from({ length: 30 }, (_, index) => rawProject({
      id: `deadline-${String(index).padStart(2, '0')}`,
      name: `Project ${String(index).padStart(2, '0')}`,
      ...(index === 29 ? { dueDate: LATER, effectiveDueDate: LATER } : {}),
    }));
    const deadlineId = 'deadline-29';
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects,
      tasks: projects.map(project => projectRoot(project, project.id === deadlineId
        ? { taskStatus: 'DueSoon', dueDate: LATER, effectiveDueDate: LATER }
        : {})),
    });

    expect(snapshot.projects.active).toMatchObject({ total: 30, returned: 25, truncated: true });
    expect(snapshot.projects.active.items.map(item => item.id)).not.toContain(deadlineId);
    expect(snapshot.projects.deadline).toMatchObject({ total: 1, returned: 1, truncated: false });
    expect(snapshot.projects.deadline.items.map(item => item.project.id)).toEqual([deadlineId]);
  });

  it('sorts and truncates Project deadlines independently', () => {
    const configs = [
      { id: 'due-b', name: 'B', status: 'DueSoon' as const, date: LATER },
      { id: 'overdue-later', name: 'A', status: 'Overdue' as const, date: EARLIER },
      { id: 'due-a', name: 'A', status: 'DueSoon' as const, date: LATER },
      { id: 'overdue-earlier', name: 'Z', status: 'Overdue' as const, date: '2026-07-08T00:00:00Z' },
    ];
    const projects = configs.map(config => rawProject({
      id: config.id,
      name: config.name,
      dueDate: config.date,
      effectiveDueDate: config.date,
    }));
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 3,
      projects,
      tasks: projects.map((project, index) => projectRoot(project, {
        taskStatus: configs[index].status,
        dueDate: configs[index].date,
        effectiveDueDate: configs[index].date,
      })),
    });

    expect(snapshot.projects.deadline).toMatchObject({ total: 4, returned: 3, truncated: true });
    expect(snapshot.projects.deadline.items.map(item => item.project.id)).toEqual([
      'overdue-earlier',
      'overdue-later',
      'due-a',
    ]);
  });

  it('sorts planned Projects by direct date, then UTF-16 name and id', () => {
    const earliest = '2026-07-08T12:00:00.000Z';
    const projects = [
      rawProject({ id: 'b', name: 'A' }),
      rawProject({ id: 'later', name: 'A' }),
      rawProject({ id: 'a', name: 'A' }),
    ];
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 10,
      projects,
      tasks: projects.map(project => projectRoot(project, {
        plannedDate: project.id === 'later' ? EARLIER : earliest,
        effectivePlannedDate: project.id === 'later' ? EARLIER : earliest,
      })),
    });
    expect(snapshot.projects.planned.items.map(item => item.id)).toEqual(['a', 'b', 'later']);
  });

  it('counts and truncates planned Projects independently', () => {
    const projects = Array.from({ length: 35 }, (_, index) => rawProject({
      id: `planned-${String(index).padStart(2, '0')}`,
      name: `Planned ${String(index).padStart(2, '0')}`,
    }));
    const snapshot = composeLeanSnapshot({
      generatedAt: GENERATED_AT,
      limitPerSection: 25,
      projects,
      tasks: projects.map(project => projectRoot(project, {
        plannedDate: EARLIER,
        effectivePlannedDate: EARLIER,
      })),
    });
    expect(snapshot.projects.planned).toMatchObject({
      total: 35,
      returned: 25,
      truncated: true,
    });
    expect(snapshot.projects.planned.items).toHaveLength(25);
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
      projects: {
        active: { total: 0, returned: 0, truncated: false, items: [] },
        planned: { total: 0, returned: 0, truncated: false, items: [] },
        deadline: { total: 0, returned: 0, truncated: false, items: [] },
      },
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
