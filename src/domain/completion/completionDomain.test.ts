import { describe, expect, it } from 'vitest';
import { adaptQueryCompletedTaskItem } from './completionAdapter.js';
import { classifyCompletedTaskKind } from './completionClassifier.js';
import { mapRawCompletedTaskToView } from './completionMapper.js';
import { RawCompletedTask } from './completionTypes.js';

const baseRawTask: RawCompletedTask = {
  id: 'task-1',
  name: 'Completed Task',
  note: 'note',
  completionDate: '2026-07-01T01:00:00.000Z',
  projectId: 'project-1',
  projectName: 'Project 1',
  inInbox: false,
  tagNames: ['Review'],
  isProjectRoot: false,
  hasChildren: false,
  creationDate: '2026-06-01T01:00:00.000Z',
  modificationDate: '2026-07-01T01:00:00.000Z',
};

function queryItem(overrides: Record<string, unknown> = {}) {
  return { ...baseRawTask, ...overrides };
}

describe('completionAdapter', () => {
  it('maps a valid project task', () => {
    expect(adaptQueryCompletedTaskItem(queryItem())).toEqual({
      success: true,
      task: baseRawTask,
    });
  });

  it('maps a valid Inbox task compatibility value', () => {
    const result = adaptQueryCompletedTaskItem(queryItem({
      projectId: null,
      projectName: 'Inbox',
      inInbox: true,
    }));
    expect(result.success).toBe(true);
  });

  it('maps a valid null project context', () => {
    const result = adaptQueryCompletedTaskItem(queryItem({
      projectId: null,
      projectName: null,
    }));
    expect(result.success).toBe(true);
  });

  it.each([[[]], [['Review', 'Work']]])('accepts tagNames %j', tagNames => {
    const result = adaptQueryCompletedTaskItem(queryItem({ tagNames }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.task.tagNames).toEqual(tagNames);
  });

  it.each([
    { hasChildren: false, isProjectRoot: false },
    { hasChildren: true, isProjectRoot: false },
    { hasChildren: true, isProjectRoot: true },
  ])('retains Task shape flags', overrides => {
    const result = adaptQueryCompletedTaskItem(queryItem(overrides));
    expect(result.success).toBe(true);
    if (result.success) expect(result.task).toMatchObject(overrides);
  });

  it.each([
    'id',
    'name',
    'note',
    'completionDate',
    'projectId',
    'projectName',
    'inInbox',
    'tagNames',
    'isProjectRoot',
    'hasChildren',
  ])('fails when required field %s is missing', field => {
    const item = queryItem();
    delete item[field];
    expect(adaptQueryCompletedTaskItem(item).success).toBe(false);
  });

  it.each(['', 'not-a-date', '2026-07-01', '2026-07-01T08:00:00', '2026-02-30T00:00:00.000Z'])('rejects invalid completionDate %j', completionDate => {
    expect(adaptQueryCompletedTaskItem(queryItem({ completionDate })).success).toBe(false);
  });

  it('rejects wrong tagNames type', () => {
    expect(adaptQueryCompletedTaskItem(queryItem({ tagNames: {} })).success).toBe(false);
  });

  it('rejects wrong boolean type', () => {
    expect(adaptQueryCompletedTaskItem(queryItem({ hasChildren: 'false' })).success).toBe(false);
  });

  it('rejects projectId without projectName', () => {
    expect(adaptQueryCompletedTaskItem(queryItem({ projectName: null })).success).toBe(false);
  });

  it('rejects unrelated projectName without projectId', () => {
    expect(adaptQueryCompletedTaskItem(queryItem({
      projectId: null,
      projectName: 'Unrelated',
    })).success).toBe(false);
  });

  it('rejects Inbox compatibility when task is not in Inbox', () => {
    expect(adaptQueryCompletedTaskItem(queryItem({
      projectId: null,
      projectName: 'Inbox',
      inInbox: false,
    })).success).toBe(false);
  });

  it('normalizes undefined nullable timestamps to null', () => {
    const item = queryItem();
    delete item.creationDate;
    delete item.modificationDate;
    const result = adaptQueryCompletedTaskItem(item);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.task.creationDate).toBeNull();
      expect(result.task.modificationDate).toBeNull();
    }
  });

  it('rejects invalid nullable timestamps', () => {
    expect(adaptQueryCompletedTaskItem(queryItem({ creationDate: 123 })).success).toBe(false);
    expect(adaptQueryCompletedTaskItem(queryItem({ modificationDate: 'not-a-date' })).success).toBe(false);
    expect(adaptQueryCompletedTaskItem(queryItem({ creationDate: '2026-02-30T00:00:00.000Z' })).success).toBe(false);
  });
});

describe('completionClassifier', () => {
  it('classifies an action', () => {
    expect(classifyCompletedTaskKind(baseRawTask)).toBe('action');
  });

  it('classifies an action group', () => {
    expect(classifyCompletedTaskKind({ ...baseRawTask, hasChildren: true })).toBe('action_group');
  });
});

describe('completionMapper', () => {
  it('maps the completion event fields', () => {
    const view = mapRawCompletedTaskToView(baseRawTask);
    expect(view).toMatchObject({
      id: 'task-1',
      name: 'Completed Task',
      note: 'note',
      kind: 'action',
      completedDate: '2026-07-01T01:00:00.000Z',
      project: { id: 'project-1', name: 'Project 1' },
      location: { inInbox: false },
      tags: ['Review'],
      timestamps: {
        created: '2026-06-01T01:00:00.000Z',
        modified: '2026-07-01T01:00:00.000Z',
      },
    });
  });

  it('maps Inbox context to null project', () => {
    const view = mapRawCompletedTaskToView({
      ...baseRawTask,
      projectId: null,
      projectName: 'Inbox',
      inInbox: true,
    });
    expect(view.project).toBeNull();
    expect(view.location.inInbox).toBe(true);
  });

  it('does not expose raw or current status', () => {
    const view = mapRawCompletedTaskToView(baseRawTask);
    expect(view).not.toHaveProperty('raw');
    expect(view).not.toHaveProperty('status');
    expect(view).not.toHaveProperty('taskStatus');
  });
});
