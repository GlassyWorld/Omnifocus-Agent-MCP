import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RawCompletedTask } from '../../domain/completion/completionTypes.js';
import { getCompletedSince } from '../primitives/getCompletedSince.js';
import { _testExports, handler } from './getCompletedSince.js';

vi.mock('../primitives/getCompletedSince.js', () => ({
  getCompletedSince: vi.fn(),
}));

const mockedGetCompletedSince = vi.mocked(getCompletedSince);
const { normalizeArguments } = _testExports;

const baseRawTask: RawCompletedTask = {
  id: 'task-1',
  name: 'Completed Task',
  note: '',
  completionDate: '2026-07-01T01:00:00.000Z',
  projectId: null,
  projectName: 'Inbox',
  inInbox: true,
  tagNames: [],
  isProjectRoot: false,
  hasChildren: false,
  creationDate: null,
  modificationDate: null,
};

function parseResponse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe('getCompletedSince datetime normalization', () => {
  it.each([
    ['2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'],
    ['2026-07-01T08:00:00+08:00', '2026-07-01T00:00:00.000Z'],
    ['2026-06-30T19:00:00-05:00', '2026-07-01T00:00:00.000Z'],
  ])('normalizes %s to UTC', (input, expected) => {
    const result = normalizeArguments({
      since: input,
      until: '2026-07-02T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.since).toBe(expected);
  });

  it('accepts an inclusive equal range', () => {
    expect(normalizeArguments({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-01T00:00:00.000Z',
    }).success).toBe(true);
  });

  it('reads default current time exactly once', () => {
    const nowProvider = vi.fn(() => new Date('2026-07-02T00:00:00.000Z'));
    const result = normalizeArguments({ since: '2026-07-01T00:00:00.000Z' }, nowProvider);
    expect(nowProvider).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      success: true,
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
    });
  });

  it.each([
    [{}, 'missing since'],
    [{ since: '' }, 'empty since'],
    [{ since: '   ' }, 'whitespace since'],
    [{ since: '2026-07-01' }, 'date only'],
    [{ since: '2026-07-01T08:00:00' }, 'datetime without timezone'],
    [{ since: 'not-a-date' }, 'invalid datetime'],
    [{ since: '2026-07-01T08:00:00+99:99' }, 'invalid offset'],
    [{ since: '2026-07-01T00:00:00.000Z', until: 'not-a-date' }, 'invalid until'],
    [{ since: '2026-07-02T00:00:00.000Z', until: '2026-07-01T00:00:00.000Z' }, 'until before since'],
  ])('rejects %s', (args) => {
    expect(normalizeArguments(args as any).success).toBe(false);
  });
});

describe('getCompletedSince handler', () => {
  beforeEach(() => {
    mockedGetCompletedSince.mockReset();
  });

  it('passes normalized explicit bounds to the primitive', async () => {
    mockedGetCompletedSince.mockResolvedValue({ success: true, tasks: [], count: 0 });
    await handler({
      since: '2026-07-01T08:00:00+08:00',
      until: '2026-07-02T08:00:00+08:00',
    }, {} as any);
    expect(mockedGetCompletedSince).toHaveBeenCalledWith({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
    });
  });

  it('returns invalid_arguments for missing since', async () => {
    const result = await handler({}, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('returns invalid_arguments for an invalid interval', async () => {
    const result = await handler({
      since: '2026-07-02T00:00:00.000Z',
      until: '2026-07-01T00:00:00.000Z',
    }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('returns an empty completed list successfully', async () => {
    mockedGetCompletedSince.mockResolvedValue({ success: true, tasks: [], count: 0 });
    const result = await handler({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
    }, {} as any);
    expect(parseResponse(result)).toEqual({ success: true, completed: [] });
  });

  it('maps completion events without status or raw fields', async () => {
    mockedGetCompletedSince.mockResolvedValue({ success: true, tasks: [baseRawTask], count: 1 });
    const result = await handler({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
    }, {} as any);
    const event = parseResponse(result).completed[0];
    expect(event.kind).toBe('action');
    expect(event.completedDate).toBe(baseRawTask.completionDate);
    expect(event).not.toHaveProperty('raw');
    expect(event).not.toHaveProperty('status');
    expect(event).not.toHaveProperty('taskStatus');
  });

  it('returns query_failed for primitive failure', async () => {
    mockedGetCompletedSince.mockResolvedValue({ success: false, error: 'boom' });
    const result = await handler({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-07-02T00:00:00.000Z',
    }, {} as any);
    expect(parseResponse(result).error.code).toBe('query_failed');
  });
});
