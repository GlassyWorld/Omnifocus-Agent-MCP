import { describe, expect, it } from 'vitest';
import { adaptRawTagSnapshot } from './tagAdapter.js';
import { RawTagCandidate } from './tagSchemas.js';

const root: RawTagCandidate = {
  id: 'root',
  name: 'Contexts',
  status: 'Active',
  parentId: null,
  childrenAreMutuallyExclusive: true,
};

const child: RawTagCandidate = {
  id: 'child',
  name: 'Office',
  status: 'OnHold',
  parentId: 'root',
  childrenAreMutuallyExclusive: false,
};

const grandchild: RawTagCandidate = {
  id: 'grandchild',
  name: 'Desk',
  status: 'Dropped',
  parentId: 'child',
  childrenAreMutuallyExclusive: false,
};

describe('adaptRawTagSnapshot', () => {
  it('maps exact statuses and derives hierarchy, path, and exclusivity facts', () => {
    const result = adaptRawTagSnapshot([grandchild, child, root]);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.tags.find(tag => tag.id === 'root')).toMatchObject({
      status: 'active',
      hierarchy: { parentId: null, childIds: ['child'] },
    });
    expect(result.tags.find(tag => tag.id === 'child')).toEqual({
      id: 'child',
      name: 'Office',
      status: 'on_hold',
      hierarchy: {
        parentId: 'root',
        childIds: ['grandchild'],
        path: [
          { id: 'root', name: 'Contexts', status: 'active' },
          { id: 'child', name: 'Office', status: 'on_hold' },
        ],
      },
      exclusivity: {
        childrenAreMutuallyExclusive: false,
        memberOfMutuallyExclusiveGroupId: 'root',
      },
    });
    expect(result.tags.find(tag => tag.id === 'grandchild')?.hierarchy.path.at(-1)).toEqual({
      id: 'grandchild', name: 'Desk', status: 'dropped',
    });
    expect(result.tags.find(tag => tag.id === 'grandchild')?.exclusivity)
      .toMatchObject({ memberOfMutuallyExclusiveGroupId: null });
  });

  it('keeps same-name tags as separate canonical identities', () => {
    const result = adaptRawTagSnapshot([
      root,
      { ...child, id: 'a', name: 'Same' },
      { ...child, id: 'b', name: 'Same' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) expect(result.tags.map(tag => tag.id)).toEqual(['root', 'a', 'b']);
  });

  it.each([
    ['raw_schema_drift', [{ ...root, name: 1 }]],
    ['raw_schema_drift', [{ ...root, id: '' }]],
    ['unknown_status', [{ ...root, status: 'FutureStatus' }]],
    ['duplicate_id', [root, { ...child, id: 'root' }]],
    ['orphan_parent', [{ ...child, parentId: 'missing' }]],
    ['self_parent', [{ ...root, parentId: 'root' }]],
    ['cycle_detected', [
      { ...root, id: 'a', parentId: 'b' },
      { ...child, id: 'b', parentId: 'a' },
    ]],
    ['cycle_detected', [
      { ...root, id: 'a', parentId: 'b' },
      { ...child, id: 'b', parentId: 'c' },
      { ...grandchild, id: 'c', parentId: 'a' },
    ]],
  ])('fails closed with %s', (reason, input) => {
    const result = adaptRawTagSnapshot(input);
    expect(result).toMatchObject({ success: false, reason });
  });

  it('does not expose raw IDs or names in failure messages', () => {
    const result = adaptRawTagSnapshot([{ ...child, id: 'private-id', name: 'private-name', parentId: 'missing-private' }]);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private');
  });
});
