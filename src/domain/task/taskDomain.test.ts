import { describe, expect, it } from 'vitest';
import { adaptQueryTaskItem } from './taskAdapter.js';
import { classifyDate } from './dateSemantics.js';
import { classifyCompletion, classifyDrop, classifyFlag } from './statusSemantics.js';
import { classifyTaskKind } from './taskClassifier.js';
import { mapRawTaskToTaskView } from './taskMapper.js';
import { RawTask } from './taskTypes.js';

const baseRawTask: RawTask = {
  id: 'task-1',
  name: 'Task 1',
  note: 'note',
  taskStatus: 'Available',
  flagged: false,
  effectiveFlagged: false,
  completed: false,
  completionDate: null,
  effectiveCompletedDate: null,
  dropDate: null,
  effectiveDropDate: null,
  dueDate: null,
  effectiveDueDate: null,
  deferDate: null,
  effectiveDeferDate: null,
  plannedDate: null,
  effectivePlannedDate: null,
  tagNames: ['Work'],
  projectName: 'Project',
  projectId: 'project-1',
  inInbox: false,
  isProjectRoot: false,
  parentId: null,
  childIds: [],
  hasChildren: false,
  sequential: false,
  completedByChildren: false,
  isRepeating: false,
  repetitionRule: null,
  estimatedMinutes: null,
  creationDate: null,
  modificationDate: null,
};

function queryItem(overrides: Record<string, unknown> = {}) {
  return {
    ...baseRawTask,
    ...overrides,
  };
}

describe('taskAdapter', () => {
  it('maps a complete query item to RawTask', () => {
    const result = adaptQueryTaskItem(queryItem());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.task).toEqual(baseRawTask);
    }
  });

  it.each(['id', 'name', 'note', 'taskStatus', 'isProjectRoot', 'hasChildren'])('fails when %s is missing', field => {
    const item = queryItem();
    delete item[field];
    const result = adaptQueryTaskItem(item);
    expect(result.success).toBe(false);
  });

  it('fails when id is empty', () => {
    expect(adaptQueryTaskItem(queryItem({ id: '' })).success).toBe(false);
  });

  it('fails when note is null', () => {
    expect(adaptQueryTaskItem(queryItem({ note: null })).success).toBe(false);
  });

  it('fails on wrong boolean type', () => {
    expect(adaptQueryTaskItem(queryItem({ flagged: 'false' })).success).toBe(false);
  });

  it('fails on wrong array type', () => {
    expect(adaptQueryTaskItem(queryItem({ tagNames: {} })).success).toBe(false);
  });

  it('fails on wrong number type', () => {
    expect(adaptQueryTaskItem(queryItem({ estimatedMinutes: '15' })).success).toBe(false);
  });

  it('normalizes undefined nullable fields to null', () => {
    const item = queryItem();
    delete item.completionDate;
    const result = adaptQueryTaskItem(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.task.completionDate).toBeNull();
    }
  });

  it('allows Inbox compatibility projectName when projectId is null', () => {
    const result = adaptQueryTaskItem(queryItem({
      projectId: null,
      projectName: 'Inbox',
      inInbox: true,
    }));
    expect(result.success).toBe(true);
  });

  it('allows null projectName when projectId is null', () => {
    const result = adaptQueryTaskItem(queryItem({
      projectId: null,
      projectName: null,
      inInbox: false,
    }));
    expect(result.success).toBe(true);
  });

  it('fails when projectId is empty', () => {
    expect(adaptQueryTaskItem(queryItem({ projectId: '' })).success).toBe(false);
  });

  it('fails when projectId is null and projectName is not Inbox', () => {
    const result = adaptQueryTaskItem(queryItem({
      projectId: null,
      projectName: 'Project',
    }));
    expect(result.success).toBe(false);
  });

  it('fails when projectId is present and projectName is null', () => {
    const result = adaptQueryTaskItem(queryItem({
      projectId: 'project-1',
      projectName: null,
    }));
    expect(result.success).toBe(false);
  });
});

describe('taskClassifier', () => {
  it('classifies project root', () => {
    expect(classifyTaskKind({ ...baseRawTask, isProjectRoot: true, hasChildren: false })).toBe('project_root');
  });

  it('classifies action group', () => {
    expect(classifyTaskKind({ ...baseRawTask, isProjectRoot: false, hasChildren: true })).toBe('action_group');
  });

  it('classifies action', () => {
    expect(classifyTaskKind({ ...baseRawTask, isProjectRoot: false, hasChildren: false })).toBe('action');
  });
});

describe('dateSemantics', () => {
  it.each([
    ['due', '2026-01-01', '2026-01-01', 'direct'],
    ['planned', null, '2026-01-02', 'inherited'],
    ['defer', null, null, 'none'],
  ])('classifies %s date source', (_label, direct, effective, source) => {
    expect(classifyDate(direct, effective)).toEqual({ direct, effective, source });
  });
});

describe('statusSemantics', () => {
  it('classifies direct completion from completed boolean', () => {
    expect(classifyCompletion({ ...baseRawTask, completed: true })).toMatchObject({ direct: true, source: 'direct' });
  });

  it('classifies direct completion from completionDate', () => {
    expect(classifyCompletion({ ...baseRawTask, completionDate: '2026-01-01' })).toMatchObject({ direct: true, source: 'direct' });
  });

  it('classifies inherited completion', () => {
    expect(classifyCompletion({ ...baseRawTask, effectiveCompletedDate: '2026-01-01' })).toEqual({
      direct: false,
      directDate: null,
      effectiveDate: '2026-01-01',
      source: 'inherited',
    });
  });

  it('classifies no completion', () => {
    expect(classifyCompletion(baseRawTask)).toMatchObject({ direct: false, source: 'none' });
  });

  it('classifies direct drop', () => {
    expect(classifyDrop({ ...baseRawTask, dropDate: '2026-01-01' })).toMatchObject({ direct: true, source: 'direct' });
  });

  it('classifies inherited drop', () => {
    expect(classifyDrop({ ...baseRawTask, effectiveDropDate: '2026-01-01' })).toEqual({
      direct: false,
      directDate: null,
      effectiveDate: '2026-01-01',
      source: 'inherited',
    });
  });

  it('classifies no drop', () => {
    expect(classifyDrop(baseRawTask)).toMatchObject({ direct: false, source: 'none' });
  });

  it('classifies direct flag', () => {
    expect(classifyFlag({ ...baseRawTask, flagged: true })).toEqual({
      direct: true,
      effective: true,
      source: 'direct',
    });
  });

  it('classifies inherited flag', () => {
    expect(classifyFlag({ ...baseRawTask, effectiveFlagged: true })).toEqual({
      direct: false,
      effective: true,
      source: 'inherited',
    });
  });

  it('classifies no flag', () => {
    expect(classifyFlag(baseRawTask)).toEqual({
      direct: false,
      effective: false,
      source: 'none',
    });
  });
});

describe('taskMapper', () => {
  it('maps Inbox location separately from project context', () => {
    const view = mapRawTaskToTaskView({
      ...baseRawTask,
      projectId: null,
      projectName: 'Inbox',
      inInbox: true,
    });
    expect(view.project).toBeNull();
    expect(view.location.inInbox).toBe(true);
  });

  it('maps project task to project object', () => {
    const view = mapRawTaskToTaskView(baseRawTask);
    expect(view.project).toEqual({ id: 'project-1', name: 'Project' });
  });

  it('uses a null check for project context', () => {
    const view = mapRawTaskToTaskView({
      ...baseRawTask,
      projectId: '',
    });
    expect(view.project).toEqual({ id: '', name: 'Project' });
  });

  it('maps tags from tagNames and does not expose raw', () => {
    const view = mapRawTaskToTaskView(baseRawTask);
    expect(view.tags).toEqual(['Work']);
    expect(view).not.toHaveProperty('raw');
  });

  it('preserves direct and effective dates', () => {
    const view = mapRawTaskToTaskView({
      ...baseRawTask,
      dueDate: '2026-01-01',
      effectiveDueDate: '2026-01-02',
    });
    expect(view.dates.due).toEqual({
      direct: '2026-01-01',
      effective: '2026-01-02',
      source: 'direct',
    });
  });

  it('preserves completion, drop, and flag semantics', () => {
    const view = mapRawTaskToTaskView({
      ...baseRawTask,
      effectiveCompletedDate: '2026-01-01',
      effectiveDropDate: '2026-01-02',
      effectiveFlagged: true,
    });
    expect(view.status.completion.source).toBe('inherited');
    expect(view.status.drop.source).toBe('inherited');
    expect(view.status.flagged.source).toBe('inherited');
  });
});
