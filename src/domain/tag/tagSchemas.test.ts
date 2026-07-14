import { describe, expect, it } from 'vitest';
import {
  searchTagsInputSchema,
  searchTagsSuccessSchema,
} from './tagSchemas.js';

describe('searchTagsInputSchema', () => {
  it('accepts the empty input and normalizes a non-empty query', () => {
    expect(searchTagsInputSchema.parse({})).toEqual({});
    expect(searchTagsInputSchema.parse({ query: '  Home  ' })).toEqual({ query: 'Home' });
  });

  it.each([
    null,
    { extra: true },
    { query: '' },
    { query: '   ' },
    { status: [] },
    { status: ['active', 'active'] },
    { status: ['unknown'] },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
  ])('rejects invalid strict input %#', (input) => {
    expect(searchTagsInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('searchTagsSuccessSchema', () => {
  const valid = {
    success: true as const,
    tags: [{
      id: 'tag-1',
      name: 'Home',
      status: 'active' as const,
      hierarchy: {
        parentId: null,
        childIds: [],
        path: [{ id: 'tag-1', name: 'Home', status: 'active' as const }],
      },
      exclusivity: {
        childrenAreMutuallyExclusive: false,
        memberOfMutuallyExclusiveGroupId: null,
      },
    }],
    page: { matched: 1, returned: 1, truncated: false },
  };

  it('accepts the strict nested output contract', () => {
    expect(searchTagsSuccessSchema.parse(valid)).toEqual(valid);
  });

  it('rejects unknown keys at every object boundary', () => {
    expect(searchTagsSuccessSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
    expect(searchTagsSuccessSchema.safeParse({
      ...valid,
      tags: [{ ...valid.tags[0], raw: true }],
    }).success).toBe(false);
    expect(searchTagsSuccessSchema.safeParse({
      ...valid,
      tags: [{
        ...valid.tags[0],
        hierarchy: { ...valid.tags[0].hierarchy, raw: true },
      }],
    }).success).toBe(false);
  });
});
