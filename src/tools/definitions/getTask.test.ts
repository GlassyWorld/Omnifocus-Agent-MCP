import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler, schema } from './getTask.js';
import { getTask } from '../primitives/getTask.js';
import { RawTask } from '../../domain/task/taskTypes.js';

vi.mock('../primitives/getTask.js', () => ({
  getTask: vi.fn(),
}));

const mockedGetTask = vi.mocked(getTask);

const baseRawTask: RawTask = {
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

function parseResponse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe('getTask schema', () => {
  it('accepts id only', () => {
    expect(schema.safeParse({ id: 'task-1' }).success).toBe(true);
  });

  it('accepts name only', () => {
    expect(schema.safeParse({ name: 'Task 1' }).success).toBe(true);
  });
});

describe('getTask handler', () => {
  beforeEach(() => {
    mockedGetTask.mockReset();
  });

  it('rejects id and name together', async () => {
    const result = await handler({ id: 'task-1', name: 'Task 1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('rejects neither id nor name', async () => {
    const result = await handler({}, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('rejects empty id', async () => {
    const result = await handler({ id: '' }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('rejects whitespace-only name', async () => {
    const result = await handler({ name: '   ' }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('preserves exact name with meaningful leading and trailing spaces', async () => {
    mockedGetTask.mockResolvedValue({ success: true, tasks: [baseRawTask], count: 1 });
    await handler({ name: ' Task ' }, {} as any);
    expect(mockedGetTask).toHaveBeenCalledWith({ name: ' Task ' });
  });

  it('returns not_found for zero results', async () => {
    mockedGetTask.mockResolvedValue({ success: true, tasks: [], count: 0 });
    const result = await handler({ id: 'missing' }, {} as any);
    expect(parseResponse(result).error.code).toBe('not_found');
  });

  it('returns success for one result', async () => {
    mockedGetTask.mockResolvedValue({ success: true, tasks: [baseRawTask], count: 1 });
    const result = await handler({ id: 'task-1' }, {} as any);
    const body = parseResponse(result);
    expect(body.success).toBe(true);
    expect(body.task.id).toBe('task-1');
    expect(body.task).not.toHaveProperty('raw');
  });

  it('returns ambiguous_match for two results', async () => {
    mockedGetTask.mockResolvedValue({ success: true, tasks: [baseRawTask, { ...baseRawTask, id: 'task-2' }], count: 2 });
    const result = await handler({ name: 'Task 1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('ambiguous_match');
  });

  it('returns query_failed for primitive failure', async () => {
    mockedGetTask.mockResolvedValue({ success: false, error: 'boom' });
    const result = await handler({ id: 'task-1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('query_failed');
  });

  it('returns query_failed for thrown errors', async () => {
    mockedGetTask.mockRejectedValue(new Error('adapter failure'));
    const result = await handler({ id: 'task-1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('query_failed');
  });
});
