import { describe, expect, it } from 'vitest';
import { adaptQueryProjectItem } from './projectAdapter.js';
import { classifyProjectKind } from './projectClassifier.js';
import { classifyProjectDate } from './projectDateSemantics.js';
import { mapRawProjectToProjectView } from './projectMapper.js';
import { RawProject } from './projectTypes.js';

const baseRawProject: RawProject = {
  id: 'project-root-1',
  name: 'Project 1',
  note: 'note',
  status: 'Active',
  sequential: false,
  flagged: false,
  containsSingletonActions: false,
  completedByChildren: false,
  folderId: 'folder-1',
  folderName: 'Folder 1',
  directTaskIds: ['task-1'],
  taskIds: ['task-1', 'task-2'],
  taskStatusCounts: {
    available: 1,
    next: 0,
    blocked: 1,
    dueSoon: 0,
    overdue: 0,
    completed: 0,
    dropped: 0,
  },
  dueDate: null,
  effectiveDueDate: null,
  deferDate: null,
  effectiveDeferDate: null,
  creationDate: null,
  modificationDate: null,
};

function queryItem(overrides: Record<string, unknown> = {}) {
  return { ...baseRawProject, ...overrides };
}

describe('projectAdapter', () => {
  it('maps a complete query item to RawProject', () => {
    const result = adaptQueryProjectItem(queryItem());
    expect(result).toEqual({ success: true, project: baseRawProject });
  });

  it.each([
    'id',
    'name',
    'note',
    'status',
    'sequential',
    'flagged',
    'containsSingletonActions',
    'completedByChildren',
    'directTaskIds',
    'taskIds',
    'taskStatusCounts',
  ])('fails when required field %s is missing', field => {
    const item = queryItem();
    delete item[field];
    expect(adaptQueryProjectItem(item).success).toBe(false);
  });

  it('normalizes undefined nullable fields to null', () => {
    const item = queryItem();
    delete item.dueDate;
    const result = adaptQueryProjectItem(item);
    expect(result.success).toBe(true);
    if (result.success) expect(result.project.dueDate).toBeNull();
  });

  it('rejects an unknown project status', () => {
    expect(adaptQueryProjectItem(queryItem({ status: 'Unknown' })).success).toBe(false);
  });

  it('rejects wrong boolean types', () => {
    expect(adaptQueryProjectItem(queryItem({ sequential: 'false' })).success).toBe(false);
  });

  it('rejects wrong array types', () => {
    expect(adaptQueryProjectItem(queryItem({ taskIds: {} })).success).toBe(false);
  });

  it.each([
    [[''], 'empty'],
    [['task-1', 'task-1'], 'duplicate'],
  ])('rejects %s task IDs', (taskIds) => {
    expect(adaptQueryProjectItem(queryItem({ taskIds })).success).toBe(false);
  });

  it('accepts a folder id/name pair', () => {
    expect(adaptQueryProjectItem(queryItem()).success).toBe(true);
  });

  it('accepts null folder id/name', () => {
    expect(adaptQueryProjectItem(queryItem({ folderId: null, folderName: null })).success).toBe(true);
  });

  it.each([
    { folderId: 'folder-1', folderName: null },
    { folderId: null, folderName: 'Folder 1' },
  ])('rejects an incomplete folder pair', overrides => {
    expect(adaptQueryProjectItem(queryItem(overrides)).success).toBe(false);
  });

  it('rejects invalid status counts', () => {
    expect(adaptQueryProjectItem(queryItem({
      taskStatusCounts: { ...baseRawProject.taskStatusCounts, completed: -1 },
    })).success).toBe(false);
  });

  it('does not require status counts to sum to taskIds length', () => {
    const result = adaptQueryProjectItem(queryItem({
      taskStatusCounts: { ...baseRawProject.taskStatusCounts, completed: 10 },
    }));
    expect(result.success).toBe(true);
  });
});

describe('projectClassifier', () => {
  it('classifies a standard project', () => {
    expect(classifyProjectKind(baseRawProject)).toBe('standard');
  });

  it('classifies a single-actions project', () => {
    expect(classifyProjectKind({ ...baseRawProject, containsSingletonActions: true })).toBe('single_actions');
  });
});

describe('projectDateSemantics', () => {
  it.each([
    ['due direct', '2026-01-01', '2026-01-01', 'direct'],
    ['due inherited', null, '2026-01-02', 'inherited'],
    ['defer none', null, null, 'none'],
  ])('classifies %s', (_label, direct, effective, source) => {
    expect(classifyProjectDate(direct, effective)).toEqual({ direct, effective, source });
  });
});

describe('projectMapper', () => {
  it.each([
    ['Active', 'active'],
    ['OnHold', 'onHold'],
    ['Done', 'completed'],
    ['Dropped', 'dropped'],
  ])('maps %s project status', (status, flag) => {
    const view = mapRawProjectToProjectView({ ...baseRawProject, status });
    expect(view.status.raw).toBe(status);
    expect(view.status[flag as keyof typeof view.status]).toBe(true);
  });

  it('maps folder context', () => {
    expect(mapRawProjectToProjectView(baseRawProject).folder).toEqual({
      id: 'folder-1',
      name: 'Folder 1',
    });
  });

  it('maps a root-level project to null folder', () => {
    const view = mapRawProjectToProjectView({ ...baseRawProject, folderId: null, folderName: null });
    expect(view.folder).toBeNull();
  });

  it('maps direct and flattened task relations', () => {
    const view = mapRawProjectToProjectView(baseRawProject);
    expect(view.tasks.directIds).toEqual(['task-1']);
    expect(view.tasks.allIds).toEqual(['task-1', 'task-2']);
    expect(view.tasks.total).toBe(2);
    expect(view.tasks.byStatus).toEqual(baseRawProject.taskStatusCounts);
  });

  it('preserves due and defer direct/effective semantics', () => {
    const view = mapRawProjectToProjectView({
      ...baseRawProject,
      dueDate: '2026-01-01',
      effectiveDueDate: '2026-01-02',
      effectiveDeferDate: '2026-01-03',
    });
    expect(view.dates.due).toEqual({
      direct: '2026-01-01',
      effective: '2026-01-02',
      source: 'direct',
    });
    expect(view.dates.defer).toEqual({
      direct: null,
      effective: '2026-01-03',
      source: 'inherited',
    });
  });

  it('does not expose RawProject', () => {
    expect(mapRawProjectToProjectView(baseRawProject)).not.toHaveProperty('raw');
  });
});
