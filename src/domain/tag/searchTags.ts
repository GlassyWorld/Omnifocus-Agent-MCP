import {
  SearchTagsInput,
  SearchTagsSuccess,
  TagDiscoveryView,
  TagStatus,
} from './tagSchemas.js';

export const DEFAULT_SEARCH_TAGS_LIMIT = 25;
export const DEFAULT_SEARCH_TAGS_STATUS: readonly TagStatus[] = ['active'];

export function searchTags(
  tags: readonly TagDiscoveryView[],
  input: SearchTagsInput,
): SearchTagsSuccess {
  const statuses = new Set<TagStatus>(input.status ?? DEFAULT_SEARCH_TAGS_STATUS);
  const query = input.query?.toLocaleLowerCase('en-US') ?? null;
  const limit = input.limit ?? DEFAULT_SEARCH_TAGS_LIMIT;

  const matches = tags
    .filter(tag => statuses.has(tag.status))
    .filter(tag => query === null || tag.hierarchy.path.some(
      segment => segment.name.toLocaleLowerCase('en-US').includes(query),
    ))
    .slice()
    .sort(compareTagViews);

  const matched = matches.length;
  const limited = matches.slice(0, limit);

  return {
    success: true,
    tags: limited,
    page: {
      matched,
      returned: limited.length,
      truncated: matched > limited.length,
    },
  };
}

function compareTagViews(left: TagDiscoveryView, right: TagDiscoveryView): number {
  const commonLength = Math.min(left.hierarchy.path.length, right.hierarchy.path.length);
  for (let index = 0; index < commonLength; index += 1) {
    const leftSegment = left.hierarchy.path[index];
    const rightSegment = right.hierarchy.path[index];
    const byName = compareStrings(leftSegment.name, rightSegment.name);
    if (byName !== 0) return byName;
    const byId = compareStrings(leftSegment.id, rightSegment.id);
    if (byId !== 0) return byId;
  }
  if (left.hierarchy.path.length !== right.hierarchy.path.length) {
    return left.hierarchy.path.length - right.hierarchy.path.length;
  }
  return compareStrings(left.id, right.id);
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
