import { describe, expect, it } from 'vitest';
import { searchTags } from './searchTags.js';
import { TagDiscoveryView, TagStatus } from './tagSchemas.js';

function view(
  id: string,
  name: string,
  status: TagStatus,
  path: Array<[string, string, TagStatus]>,
): TagDiscoveryView {
  return {
    id,
    name,
    status,
    hierarchy: {
      parentId: path.length > 1 ? path.at(-2)![0] : null,
      childIds: [],
      path: path.map(([segmentId, segmentName, segmentStatus]) => ({
        id: segmentId,
        name: segmentName,
        status: segmentStatus,
      })),
    },
    exclusivity: {
      childrenAreMutuallyExclusive: false,
      memberOfMutuallyExclusiveGroupId: null,
    },
  };
}

const parent = view('p', 'Home', 'active', [['p', 'Home', 'active']]);
const childB = view('b', 'Desk', 'active', [
  ['p', 'Home', 'active'], ['b', 'Desk', 'active'],
]);
const childA = view('a', 'Desk', 'active', [
  ['p', 'Home', 'active'], ['a', 'Desk', 'active'],
]);
const onHold = view('h', 'Waiting', 'on_hold', [['h', 'Waiting', 'on_hold']]);
const dropped = view('d', 'Archive', 'dropped', [['d', 'Archive', 'dropped']]);

describe('searchTags', () => {
  it('defaults to Active and returns deterministic parent-first order', () => {
    const result = searchTags([childB, onHold, childA, parent, dropped], {});
    expect(result.tags.map(tag => tag.id)).toEqual(['p', 'a', 'b']);
    expect(result.page).toEqual({ matched: 3, returned: 3, truncated: false });
  });

  it('filters by explicit direct status', () => {
    const result = searchTags([parent, onHold, dropped], { status: ['on_hold', 'dropped'] });
    expect(result.tags.map(tag => tag.id)).toEqual(['d', 'h']);
  });

  it('performs case-insensitive literal search across full path name segments', () => {
    expect(searchTags([parent, childA, onHold], { query: 'HOME' }).tags.map(tag => tag.id))
      .toEqual(['p', 'a']);
    expect(searchTags([parent], { query: 'H.*e' }).page.matched).toBe(0);
  });

  it('computes matched before limit and reports honest truncation', () => {
    const result = searchTags([childB, childA, parent], { limit: 2 });
    expect(result.tags.map(tag => tag.id)).toEqual(['p', 'a']);
    expect(result.page).toEqual({ matched: 3, returned: 2, truncated: true });
  });

  it('uses the default limit of 25 and distinguishes exact-limit from limit-plus-one', () => {
    const tags = Array.from({ length: 26 }, (_, index) => view(
      `tag-${String(index).padStart(2, '0')}`,
      `Tag ${String(index).padStart(2, '0')}`,
      'active',
      [[`tag-${String(index).padStart(2, '0')}`, `Tag ${String(index).padStart(2, '0')}`, 'active']],
    ));
    expect(searchTags(tags.slice(0, 25), {}).page).toEqual({
      matched: 25, returned: 25, truncated: false,
    });
    expect(searchTags(tags, {}).page).toEqual({
      matched: 26, returned: 25, truncated: true,
    });
    expect(searchTags(tags, { query: 'no match' }).page).toEqual({
      matched: 0, returned: 0, truncated: false,
    });
    expect(searchTags(tags, { query: 'Tag 00' }).page).toEqual({
      matched: 1, returned: 1, truncated: false,
    });
  });

  it('is stable when raw input order changes', () => {
    const first = searchTags([childB, parent, childA], {});
    const second = searchTags([childA, childB, parent], {});
    expect(second).toEqual(first);
  });
});
