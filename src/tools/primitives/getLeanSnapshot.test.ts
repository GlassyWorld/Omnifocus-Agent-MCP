import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryOmnifocus } from './queryOmnifocus.js';
import {
  GET_LEAN_PROJECT_RAW_FIELDS,
  GET_LEAN_TASK_RAW_FIELDS,
  getLeanSnapshot,
} from './getLeanSnapshot.js';

vi.mock('./queryOmnifocus.js', () => ({ queryOmnifocus: vi.fn() }));
const mockedQueryOmnifocus = vi.mocked(queryOmnifocus);

const validTask = {
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
  inInbox: true,
  isProjectRoot: false,
  hasChildren: false,
  creationDate: null,
};

const validProject = {
  id: 'project-1',
  name: 'Project',
  hasNote: false,
  status: 'Active',
  sequential: false,
  flagged: false,
  containsSingletonActions: false,
  folderId: null,
  folderName: null,
  totalTaskCount: 1,
  taskStatusCounts: {
    available: 1,
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
};

const validRootTask = {
  ...validTask,
  id: validProject.id,
  name: validProject.name,
  taskStatus: 'Blocked',
  inInbox: false,
  isProjectRoot: true,
  hasChildren: true,
};

const params = {
  generatedAt: '2026-07-10T12:00:00.000Z',
  limitPerSection: 25,
};

function mockSuccessfulQueries(tasks = [validTask, validRootTask], projects = [validProject]) {
  mockedQueryOmnifocus.mockImplementation(async query => (
    query.entity === 'tasks'
      ? { success: true, items: tasks, count: tasks.length }
      : { success: true, items: projects, count: projects.length }
  ));
}

describe('getLeanSnapshot primitive', () => {
  beforeEach(() => {
    mockedQueryOmnifocus.mockReset();
  });

  it('uses exactly two fixed uncapped Raw queries', async () => {
    mockSuccessfulQueries();
    const result = await getLeanSnapshot(params);
    expect(result.success).toBe(true);
    expect(mockedQueryOmnifocus).toHaveBeenCalledTimes(2);
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith({
      entity: 'tasks',
      fields: [...GET_LEAN_TASK_RAW_FIELDS],
      includeCompleted: false,
    });
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith({
      entity: 'projects',
      filters: { status: ['Active'] },
      fields: [...GET_LEAN_PROJECT_RAW_FIELDS],
      includeCompleted: false,
    });
    for (const [query] of mockedQueryOmnifocus.mock.calls) {
      expect(query).not.toHaveProperty('limit');
      expect(query).not.toHaveProperty('sortBy');
      expect(query).not.toHaveProperty('sortOrder');
    }
  });

  it('returns a composed Lean Snapshot without Markdown', async () => {
    mockSuccessfulQueries();
    const result = await getLeanSnapshot(params);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.snapshot.scope).toBe('all');
      expect(result.snapshot.projects.active.total).toBe(1);
      expect(result.snapshot.projects.planned.total).toBe(0);
      expect(result.snapshot.inbox.total).toBe(1);
      expect(JSON.stringify(result.snapshot)).not.toMatch(/"raw"|"note"/);
    }
  });

  it('returns task query failures', async () => {
    mockedQueryOmnifocus.mockImplementation(async query => (
      query.entity === 'tasks'
        ? { success: false, error: 'task read failed' }
        : { success: true, items: [], count: 0 }
    ));
    expect(await getLeanSnapshot(params)).toEqual({
      success: false,
      error: 'Task query failed: task read failed',
    });
  });

  it('returns project query failures', async () => {
    mockedQueryOmnifocus.mockImplementation(async query => (
      query.entity === 'projects'
        ? { success: false, error: 'project read failed' }
        : { success: true, items: [], count: 0 }
    ));
    expect(await getLeanSnapshot(params)).toEqual({
      success: false,
      error: 'Project query failed: project read failed',
    });
  });

  it('fails instead of skipping malformed Task or Project items', async () => {
    mockSuccessfulQueries([{ ...validTask, hasNote: 'false' } as any], []);
    expect((await getLeanSnapshot(params)).success).toBe(false);

    mockSuccessfulQueries([], [{ ...validProject, totalTaskCount: -1 } as any]);
    const projectFailure = await getLeanSnapshot(params);
    expect(projectFailure.success).toBe(false);
    if (!projectFailure.success) expect(projectFailure.error).toContain('totalTaskCount');
  });

  it('returns composer invariant failures', async () => {
    mockSuccessfulQueries([validRootTask], [{ ...validProject, status: 'OnHold' }]);
    const result = await getLeanSnapshot(params);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Active');
  });

  it('returns missing Project root contract failures', async () => {
    mockSuccessfulQueries([validTask], [validProject]);
    const result = await getLeanSnapshot(params);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Missing Project root Task');
  });
});
