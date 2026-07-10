import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET_TASK_RAW_FIELDS, getTask } from './getTask.js';
import { queryOmnifocus } from './queryOmnifocus.js';

vi.mock('./queryOmnifocus.js', () => ({
  queryOmnifocus: vi.fn(),
}));

const mockedQueryOmnifocus = vi.mocked(queryOmnifocus);

const validItem = {
  id: 'task-1',
  name: 'Task 1',
  note: '',
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
  tagNames: [],
  projectName: null,
  projectId: null,
  inInbox: true,
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

describe('getTask primitive', () => {
  beforeEach(() => {
    mockedQueryOmnifocus.mockReset();
  });

  it('queries by exact taskId with fixed raw fields', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [validItem], count: 1 });
    const result = await getTask({ id: 'task-1' });
    expect(result.success).toBe(true);
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith({
      entity: 'tasks',
      filters: { taskId: 'task-1' },
      fields: [...GET_TASK_RAW_FIELDS],
      includeCompleted: true,
      limit: 2,
    });
  });

  it('queries by exact taskNameExact with fixed raw fields', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [validItem], count: 1 });
    await getTask({ name: 'Task 1' });
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith(expect.objectContaining({
      filters: { taskNameExact: 'Task 1' },
      includeCompleted: true,
      limit: 2,
    }));
  });

  it('returns primitive query failures', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: false, error: 'query failed' });
    const result = await getTask({ id: 'task-1' });
    expect(result).toEqual({ success: false, error: 'query failed' });
  });

  it('returns adapter failures', async () => {
    mockedQueryOmnifocus.mockResolvedValue({
      success: true,
      items: [{ ...validItem, flagged: 'false' }],
      count: 1,
    });
    const result = await getTask({ id: 'task-1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('flagged');
    }
  });
});
