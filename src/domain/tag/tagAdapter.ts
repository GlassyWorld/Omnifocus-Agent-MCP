import { z } from 'zod';
import {
  rawTagCandidateSchema,
  TagDiscoveryView,
  TagPathSegment,
  TagStatus,
} from './tagSchemas.js';

export type TagAdapterFailureReason =
  | 'raw_schema_drift'
  | 'unknown_status'
  | 'duplicate_id'
  | 'orphan_parent'
  | 'self_parent'
  | 'cycle_detected';

export type TagAdapterResult =
  | { success: true; tags: TagDiscoveryView[] }
  | { success: false; reason: TagAdapterFailureReason; error: string };

const rawTagArraySchema = z.array(rawTagCandidateSchema);

const STATUS_MAP: Readonly<Record<string, TagStatus>> = {
  Active: 'active',
  OnHold: 'on_hold',
  Dropped: 'dropped',
};

export function adaptRawTagSnapshot(input: unknown): TagAdapterResult {
  const parsed = rawTagArraySchema.safeParse(input);
  if (!parsed.success) {
    return failure('raw_schema_drift', 'The OmniFocus Tag snapshot did not match the required schema.');
  }

  const byId = new Map<string, (typeof parsed.data)[number]>();
  for (const tag of parsed.data) {
    if (byId.has(tag.id)) {
      return failure('duplicate_id', 'The OmniFocus Tag snapshot contained a duplicate canonical ID.');
    }
    if (!(tag.status in STATUS_MAP)) {
      return failure('unknown_status', 'The OmniFocus Tag snapshot contained an unknown native status.');
    }
    byId.set(tag.id, tag);
  }

  for (const tag of parsed.data) {
    if (tag.parentId === tag.id) {
      return failure('self_parent', 'The OmniFocus Tag hierarchy contained a self-parent relation.');
    }
    if (tag.parentId !== null && !byId.has(tag.parentId)) {
      return failure('orphan_parent', 'The OmniFocus Tag hierarchy referenced a missing parent.');
    }
  }

  for (const tag of parsed.data) {
    const seen = new Set<string>();
    let cursor: (typeof parsed.data)[number] | undefined = tag;
    while (cursor) {
      if (seen.has(cursor.id)) {
        return failure('cycle_detected', 'The OmniFocus Tag hierarchy contained a cycle.');
      }
      seen.add(cursor.id);
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }
  }

  const childIdsByParent = new Map<string, string[]>();
  for (const tag of parsed.data) {
    childIdsByParent.set(tag.id, []);
  }
  for (const tag of parsed.data) {
    if (tag.parentId !== null) {
      childIdsByParent.get(tag.parentId)!.push(tag.id);
    }
  }
  for (const childIds of childIdsByParent.values()) {
    childIds.sort(compareStrings);
  }

  const tags = parsed.data.map(tag => {
    const path: TagPathSegment[] = [];
    let cursor: (typeof parsed.data)[number] | undefined = tag;
    while (cursor) {
      path.unshift({
        id: cursor.id,
        name: cursor.name,
        status: STATUS_MAP[cursor.status],
      });
      cursor = cursor.parentId === null ? undefined : byId.get(cursor.parentId);
    }

    const parent = tag.parentId === null ? undefined : byId.get(tag.parentId);
    return {
      id: tag.id,
      name: tag.name,
      status: STATUS_MAP[tag.status],
      hierarchy: {
        parentId: tag.parentId,
        childIds: childIdsByParent.get(tag.id)!,
        path,
      },
      exclusivity: {
        childrenAreMutuallyExclusive: tag.childrenAreMutuallyExclusive,
        memberOfMutuallyExclusiveGroupId:
          parent?.childrenAreMutuallyExclusive === true ? parent.id : null,
      },
    } satisfies TagDiscoveryView;
  });

  return { success: true, tags };
}

function failure(reason: TagAdapterFailureReason, error: string): TagAdapterResult {
  return { success: false, reason, error };
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
