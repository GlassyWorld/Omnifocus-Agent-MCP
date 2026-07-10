import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryOmnifocus } from './queryOmnifocus.js';
import {
  GET_COMPLETED_TASK_RAW_FIELDS,
  getCompletedSince,
} from './getCompletedSince.js';

vi.mock('./queryOmnifocus.js', () => ({
  queryOmnifocus: vi.fn(),
}));

const mockedQueryOmnifocus = vi.mocked(queryOmnifocus);

const validItem = {
  id: 'task-1',
  name: 'Completed Task',
  note: '',
  completionDate: '2026-07-01T01:00:00.000Z',
  projectId: 'project-1',
  projectName: 'Project 1',
  inInbox: false,
  tagNames: [],
  isProjectRoot: false,
  hasChildren: false,
  creationDate: null,
  modificationDate: null,
};

const range = {
  since: '2026-07-01T00:00:00.000Z',
  until: '2026-07-02T00:00:00.000Z',
};

describe('getCompletedSince primitive', () => {
  beforeEach(() => {
    mockedQueryOmnifocus.mockReset();
  });

  it('uses the fixed completion query contract', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [validItem], count: 1 });
    const result = await getCompletedSince(range);
    expect(result.success).toBe(true);
    expect(mockedQueryOmnifocus).toHaveBeenCalledWith({
      entity: 'tasks',
      filters: {
        completedSince: range.since,
        completedUntil: range.until,
      },
      fields: [...GET_COMPLETED_TASK_RAW_FIELDS],
      includeCompleted: true,
      sortBy: 'completionDate',
      sortOrder: 'desc',
    });
  });

  it('excludes project roots and retains action groups', async () => {
    mockedQueryOmnifocus.mockResolvedValue({
      success: true,
      items: [
        { ...validItem, id: 'root', isProjectRoot: true, hasChildren: true },
        { ...validItem, id: 'group', hasChildren: true },
      ],
      count: 2,
    });
    const result = await getCompletedSince(range);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.tasks.map(task => task.id)).toEqual(['group']);
      expect(result.tasks[0].hasChildren).toBe(true);
    }
  });

  it('returns an empty result successfully', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: true, items: [], count: 0 });
    expect(await getCompletedSince(range)).toEqual({ success: true, tasks: [], count: 0 });
  });

  it('returns query failures', async () => {
    mockedQueryOmnifocus.mockResolvedValue({ success: false, error: 'query failed' });
    expect(await getCompletedSince(range)).toEqual({ success: false, error: 'query failed' });
  });

  it('returns adapter failures without skipping malformed items', async () => {
    mockedQueryOmnifocus.mockResolvedValue({
      success: true,
      items: [{ ...validItem, tagNames: {} }],
      count: 1,
    });
    const result = await getCompletedSince(range);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('tagNames');
  });
});
