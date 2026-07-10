import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RawProject } from '../../domain/project/projectTypes.js';
import { getProject } from '../primitives/getProject.js';
import { handler, schema } from './getProject.js';

vi.mock('../primitives/getProject.js', () => ({
  getProject: vi.fn(),
}));

const mockedGetProject = vi.mocked(getProject);

const baseRawProject: RawProject = {
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
  directTaskIds: [],
  taskIds: [],
  taskStatusCounts: {
    available: 0,
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

function parseResponse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe('getProject schema', () => {
  it('accepts id only', () => {
    expect(schema.safeParse({ id: 'project-root-1' }).success).toBe(true);
  });

  it('accepts name only', () => {
    expect(schema.safeParse({ name: 'Project 1' }).success).toBe(true);
  });
});

describe('getProject handler', () => {
  beforeEach(() => {
    mockedGetProject.mockReset();
  });

  it('rejects id and name together', async () => {
    const result = await handler({ id: 'project-root-1', name: 'Project 1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('rejects neither id nor name', async () => {
    const result = await handler({}, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('rejects an empty id', async () => {
    const result = await handler({ id: '' }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('rejects a whitespace-only name', async () => {
    const result = await handler({ name: '   ' }, {} as any);
    expect(parseResponse(result).error.code).toBe('invalid_arguments');
  });

  it('preserves meaningful whitespace in an exact name', async () => {
    mockedGetProject.mockResolvedValue({ success: true, projects: [baseRawProject], count: 1 });
    await handler({ name: ' Project 1 ' }, {} as any);
    expect(mockedGetProject).toHaveBeenCalledWith({ name: ' Project 1 ' });
  });

  it('returns not_found for zero results', async () => {
    mockedGetProject.mockResolvedValue({ success: true, projects: [], count: 0 });
    const result = await handler({ id: 'missing' }, {} as any);
    expect(parseResponse(result).error.code).toBe('not_found');
  });

  it('returns success for one project', async () => {
    mockedGetProject.mockResolvedValue({ success: true, projects: [baseRawProject], count: 1 });
    const result = await handler({ id: 'project-root-1' }, {} as any);
    const body = parseResponse(result);
    expect(body.success).toBe(true);
    expect(body.project.id).toBe('project-root-1');
    expect(body.project).not.toHaveProperty('raw');
  });

  it('returns ambiguous_match for two projects', async () => {
    mockedGetProject.mockResolvedValue({
      success: true,
      projects: [baseRawProject, { ...baseRawProject, id: 'project-root-2' }],
      count: 2,
    });
    const result = await handler({ name: 'Project 1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('ambiguous_match');
  });

  it('returns query_failed for primitive failure', async () => {
    mockedGetProject.mockResolvedValue({ success: false, error: 'boom' });
    const result = await handler({ id: 'project-root-1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('query_failed');
  });

  it('returns query_failed for thrown errors', async () => {
    mockedGetProject.mockRejectedValue(new Error('adapter failure'));
    const result = await handler({ id: 'project-root-1' }, {} as any);
    expect(parseResponse(result).error.code).toBe('query_failed');
  });
});
