export type TagAssignmentPrewriteCode =
  | "tag_not_found"
  | "tag_not_allowed"
  | "mutually_exclusive_tags"
  | "tag_validation_failed";

export type TagAssignmentValidationReason =
  | "not_found"
  | "self_on_hold"
  | "self_dropped"
  | "ancestor_on_hold"
  | "ancestor_dropped"
  | "mutually_exclusive"
  | "duplicate_requested_id"
  | "lookup_failed"
  | "canonical_id_mismatch"
  | "malformed_id"
  | "unknown_status"
  | "parent_unreadable"
  | "property_unreadable"
  | "parent_cycle";

export interface TagLookup {
  byIdentifier(id: string): unknown | null;
}

export type TagAssignmentValidationResult =
  | {
      success: true;
      requestedIdsSorted: string[];
      resolvedTags: unknown[];
    }
  | {
      success: false;
      code: TagAssignmentPrewriteCode;
      reason: TagAssignmentValidationReason;
    };

type NativeTagStatus = "Active" | "OnHold" | "Dropped";

export function validateRequestedTagClosure(
  requestedIds: readonly string[],
  lookup: TagLookup,
): TagAssignmentValidationResult {
  if (new Set(requestedIds).size !== requestedIds.length) {
    return failure("tag_validation_failed", "duplicate_requested_id");
  }

  const resolvedTags: unknown[] = [];
  const exclusiveGroupOwners = new Set<string>();

  for (const requestedId of requestedIds) {
    let resolved: unknown | null;
    try {
      resolved = lookup.byIdentifier(requestedId);
    } catch {
      return failure("tag_validation_failed", "lookup_failed");
    }
    if (resolved === null) return failure("tag_not_found", "not_found");

    const resolvedId = readId(resolved);
    if (resolvedId === null) return failure("tag_validation_failed", "malformed_id");
    if (resolvedId !== requestedId) {
      return failure("tag_validation_failed", "canonical_id_mismatch");
    }

    const seen = new Set<string>();
    let cursor: unknown | null = resolved;
    let depth = 0;
    let exclusiveGroupId: string | null = null;

    while (cursor !== null) {
      const id = readId(cursor);
      if (id === null) return failure("tag_validation_failed", "malformed_id");
      if (seen.has(id)) return failure("tag_validation_failed", "parent_cycle");
      seen.add(id);

      const status = readStatus(cursor);
      if (status === null) return failure("tag_validation_failed", "unknown_status");
      if (status !== "Active") {
        return failure(
          "tag_not_allowed",
          depth === 0
            ? (status === "OnHold" ? "self_on_hold" : "self_dropped")
            : (status === "OnHold" ? "ancestor_on_hold" : "ancestor_dropped"),
        );
      }

      const parentResult = readParent(cursor);
      if (!parentResult.success) {
        return failure("tag_validation_failed", "parent_unreadable");
      }

      if (depth === 0 && parentResult.parent !== null) {
        const parentId = readId(parentResult.parent);
        if (parentId === null) return failure("tag_validation_failed", "malformed_id");
        const exclusive = readExclusiveProperty(parentResult.parent);
        if (exclusive === null) {
          return failure("tag_validation_failed", "property_unreadable");
        }
        if (exclusive) exclusiveGroupId = parentId;
      }

      cursor = parentResult.parent;
      depth += 1;
    }

    if (exclusiveGroupId !== null) {
      if (exclusiveGroupOwners.has(exclusiveGroupId)) {
        return failure("mutually_exclusive_tags", "mutually_exclusive");
      }
      exclusiveGroupOwners.add(exclusiveGroupId);
    }
    resolvedTags.push(resolved);
  }

  return {
    success: true,
    requestedIdsSorted: [...requestedIds].sort(compareCodeUnits),
    resolvedTags,
  };
}

function readId(value: unknown): string | null {
  try {
    if (typeof value !== "object" || value === null || !("id" in value)) return null;
    const id = (value as { id: unknown }).id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

function readStatus(value: unknown): NativeTagStatus | null {
  try {
    if (typeof value !== "object" || value === null || !("status" in value)) return null;
    const status = (value as { status: unknown }).status;
    return status === "Active" || status === "OnHold" || status === "Dropped"
      ? status
      : null;
  } catch {
    return null;
  }
}

function readParent(
  value: unknown,
): { success: true; parent: unknown | null } | { success: false } {
  try {
    if (typeof value !== "object" || value === null || !("parent" in value)) {
      return { success: false };
    }
    const parent = (value as { parent: unknown }).parent;
    if (parent !== null && (typeof parent !== "object" || parent === null)) {
      return { success: false };
    }
    return { success: true, parent };
  } catch {
    return { success: false };
  }
}

function readExclusiveProperty(value: unknown): boolean | null {
  try {
    if (
      typeof value !== "object"
      || value === null
      || !("childrenAreMutuallyExclusive" in value)
    ) {
      return null;
    }
    const property = (value as { childrenAreMutuallyExclusive: unknown })
      .childrenAreMutuallyExclusive;
    return typeof property === "boolean" ? property : null;
  } catch {
    return null;
  }
}

function failure(
  code: TagAssignmentPrewriteCode,
  reason: TagAssignmentValidationReason,
): TagAssignmentValidationResult {
  return { success: false, code, reason };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const _testExports = {
  readExclusiveProperty,
  readId,
  readParent,
  readStatus,
};
