import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET_PROJECT_RAW_FIELDS, getProject } from './getProject.js';
import { queryOmnifocus } from './queryOmnifocus.js';

vi.mock('./queryOmnifocus.js', () => ({
  queryOmnifocus: vi.fn(),
}));

const mockedQueryOmnifocus = vi.mocked(queryOmnifocus);

const validItem = {
  id: 'project-root-1',
  name: 'Project 1',
  note: '',
  status: 'Active',
  sequential: false,
  flagged: false,
  containsSingletonActions: false,
  completedByChildren: false,
  folderId: null,
  folderName: null,
  directTaskIds: ['task-1'],
  taskIds: ['task-1'],
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
  creationDate: null,
  modificationDate: null,
};

describe('getProject primitive', () => {
  beforeEach(() => {
    mockedQueryOmnifocus.mockReset();
  });

  it('queries by compatible projectId and fixed raw fields', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [validItem], count: 1 });
    const result = await getProject({ id: 'project-root-1' });
    expect(result.success).toBe(true);
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith({
      entity: 'projects',
      filters: { projectId: 'project-root-1' },
      fields: [...GET_PROJECT_RAW_FIELDS],
      includeCompleted: true,
      limit: 2,
    });
  });

  it('queries by case-sensitive projectNameExact', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [validItem], count: 1 });
    await getProject({ name: 'Project 1' });
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith(expect.objectContaining({
      filters: { projectNameExact: 'Project 1' },
      includeCompleted: true,
      limit: 2,
    }));
  });

  it('filters native project id matches out of the canonical contract', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [validItem], count: 1 });
    const result = await getProject({ id: 'native-project-id' });
    expect(result).toEqual({ success: true, projects: [], count: 0 });
  });

  it('returns query failures', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: false, error: 'query failed' });
    expect(await getProject({ id: 'project-root-1' })).toEqual({
      success: false,
      error: 'query failed',
    });
  });

  it('returns adapter failures', async () => {
    mockedQueryOmnifocus.mockResolvedValue({
      success: true,
      items: [{ ...validItem, sequential: 'false' }],
      count: 1,
    });
    const result = await getProject({ id: 'project-root-1' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('sequential');
  });
});
