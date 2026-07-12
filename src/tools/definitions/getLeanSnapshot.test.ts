import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLeanSnapshot } from '../primitives/getLeanSnapshot.js';
import { _testExports, handler, schema } from './getLeanSnapshot.js';
import { getLeanSnapshotSuccessSchema } from '../../domain/snapshot/snapshotSchemas.js';

vi.mock('../primitives/getLeanSnapshot.js', () => ({ getLeanSnapshot: vi.fn() }));
const mockedGetLeanSnapshot = vi.mocked(getLeanSnapshot);
const extra = {} as any;

const emptySnapshot = {
  generatedAt: '2026-07-10T12:00:00.000Z',
  scope: 'all' as const,
  projects: {
    active: { total: 0, returned: 0, truncated: false, items: [] },
    planned: { total: 0, returned: 0, truncated: false, items: [] },
    deadline: { total: 0, returned: 0, truncated: false, items: [] },
  },
  attention: {
    total: 0,
    returned: 0,
    truncated: false,
    byReason: { overdue: 0, dueSoon: 0, planned: 0, flagged: 0 },
    items: [],
  },
  inbox: { total: 0, returned: 0, truncated: false, items: [] },
};

function parseResponse(response: any) {
  return JSON.parse(response.content[0].text);
}

describe('getLeanSnapshot Tool', () => {
  beforeEach(() => {
    mockedGetLeanSnapshot.mockReset();
    mockedGetLeanSnapshot.mockResolvedValue({ success: true, snapshot: emptySnapshot });
  });

  it('uses default limit 25 and reads the clock exactly once', async () => {
    const clock = vi.fn(() => new Date(emptySnapshot.generatedAt));
    const response = await _testExports.handleWithClock({}, extra, clock);
    expect(clock).toHaveBeenCalledTimes(1);
    expect(mockedGetLeanSnapshot).toHaveBeenCalledWith({
      generatedAt: emptySnapshot.generatedAt,
      limitPerSection: 25,
    });
    const body = parseResponse(response);
    expect(body).toEqual({ success: true, snapshot: emptySnapshot });
    expect(response).toHaveProperty('structuredContent');
    if ('structuredContent' in response) {
      expect(getLeanSnapshotSuccessSchema.parse(response.structuredContent)).toEqual(body);
      expect(response.structuredContent).toEqual(body);
    }
  });

  it.each([1, 25, 100])('accepts explicit limit %s', async limitPerSection => {
    const response = await _testExports.handleWithClock(
      { limitPerSection },
      extra,
      () => new Date(emptySnapshot.generatedAt),
    );
    expect(response).not.toHaveProperty('isError');
    expect(mockedGetLeanSnapshot).toHaveBeenLastCalledWith({
      generatedAt: emptySnapshot.generatedAt,
      limitPerSection,
    });
  });

  it.each([0, 101, -1, 1.5, '25', null])(
    'returns invalid_arguments for invalid limit %j',
    async limitPerSection => {
      const response = await _testExports.handleWithClock(
        { limitPerSection } as any,
        extra,
        () => new Date(emptySnapshot.generatedAt),
      );
      expect(response.isError).toBe(true);
      expect(parseResponse(response).error.code).toBe('invalid_arguments');
      expect(mockedGetLeanSnapshot).not.toHaveBeenCalled();
    },
  );

  it('publishes a numeric optional input schema', () => {
    expect(schema.safeParse({} ).success).toBe(true);
    expect(schema.safeParse({ limitPerSection: 3 }).success).toBe(true);
    expect(schema.safeParse({ limitPerSection: '3' }).success).toBe(false);
    expect(schema.safeParse({ limitPerSection: null }).success).toBe(false);
  });

  it('returns a stable empty system response', async () => {
    const response = await handler({}, extra);
    const payload = parseResponse(response);
    expect(payload.success).toBe(true);
    expect(payload.snapshot).toEqual(emptySnapshot);
    expect(response).not.toHaveProperty('isError');
    expect(response).toHaveProperty('structuredContent');
    if ('structuredContent' in response) {
      expect(response.structuredContent).toEqual(payload);
    }
  });

  it('returns query_failed for primitive failure', async () => {
    mockedGetLeanSnapshot.mockResolvedValue({ success: false, error: 'snapshot failed' });
    const response = await handler({}, extra);
    expect(response.isError).toBe(true);
    expect(parseResponse(response)).toEqual({
      success: false,
      error: { code: 'query_failed', message: 'snapshot failed' },
    });
    expect(response).not.toHaveProperty('structuredContent');
  });

  it('does not expose forbidden Snapshot concepts', async () => {
    const response = await handler({}, extra);
    const text = response.content[0].text;
    expect(text).not.toMatch(/"raw"|"note"|"health"|"risk"|"priority"/);
    expect(text).not.toMatch(/"recommendation"|"waiting"|"recentCompletions"/);
    expect(text).not.toContain('"blocked":');
  });
});
