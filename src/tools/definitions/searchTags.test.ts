import { describe, expect, it, vi } from 'vitest';
import { searchTagsSuccessSchema } from '../../domain/tag/tagSchemas.js';
import * as getCompletedSinceDefinition from './getCompletedSince.js';
import * as getLeanSnapshotDefinition from './getLeanSnapshot.js';
import * as getProjectDefinition from './getProject.js';
import * as getTaskDefinition from './getTask.js';
import * as definition from './searchTags.js';

const rawTag = {
  id: 'tag-1',
  name: 'Private-ish Tag',
  status: 'Active',
  parentId: null,
  childrenAreMutuallyExclusive: false,
};

function parseResponse(result: any) {
  return JSON.parse(result.content[0].text);
}

describe('search_tags definition', () => {
  it('publishes strict schemas but follows the current read-tool convention of no annotations export', () => {
    const currentReadDefinitions = [
      getTaskDefinition,
      getProjectDefinition,
      getCompletedSinceDefinition,
      getLeanSnapshotDefinition,
    ];
    for (const readDefinition of currentReadDefinitions) {
      expect(readDefinition).not.toHaveProperty('annotations');
    }
    expect(definition.inputSchema).toBe(definition.schema);
    expect(definition.outputSchema).toBeDefined();
    expect(definition).not.toHaveProperty('annotations');
    expect(definition.schema.safeParse({ extra: true }).success).toBe(false);
  });

  it('reads exactly once and returns matching structured and JSON content', async () => {
    const reader = vi.fn(async () => ({ success: true as const, tags: [rawTag] }));
    const result = await definition._testExports.handleWithReader({}, {} as any, reader);
    const text = parseResponse(result);

    expect(reader).toHaveBeenCalledTimes(1);
    expect(result.structuredContent).toEqual(text);
    expect(searchTagsSuccessSchema.parse(result.structuredContent)).toEqual(text);
    expect(result).not.toHaveProperty('isError');
  });

  it('rejects runtime unknown keys before reading', async () => {
    const reader = vi.fn(async () => ({ success: true as const, tags: [] }));
    const result = await definition._testExports.handleWithReader(
      { extra: true }, {} as any, reader,
    );
    expect(parseResponse(result).error).toMatchObject({
      code: 'invalid_arguments', reason: 'invalid_arguments',
    });
    expect(reader).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('returns a stable privacy-safe primitive error', async () => {
    const result = await definition._testExports.handleWithReader({}, {} as any, async () => ({
      success: false as const,
      reason: 'process_failure' as const,
      error: 'The OmniFocus Tag snapshot could not be read safely.',
    }));
    const text = JSON.stringify(parseResponse(result));
    expect(text).toContain('process_failure');
    expect(text).not.toContain(rawTag.name);
    expect(result).not.toHaveProperty('structuredContent');
  });

  it('fails the whole request for corrupt hierarchy without exposing raw identity', async () => {
    const result = await definition._testExports.handleWithReader({}, {} as any, async () => ({
      success: true as const,
      tags: [{ ...rawTag, id: 'private-id', parentId: 'missing-private-id' }],
    }));
    const text = JSON.stringify(parseResponse(result));
    expect(text).toContain('orphan_parent');
    expect(text).not.toContain('private-id');
    expect(result.isError).toBe(true);
  });
});
