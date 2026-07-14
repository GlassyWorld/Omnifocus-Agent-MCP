import type { TaskView } from "../task/taskTypes.js";
import { verifyCreatedTask } from "./createTaskVerifier.js";
import type { CanonicalTaggedCreateTaskPayload } from "./createTaskTagSchemas.js";
import type { TaggedCreatedTaskView } from "./createTaskTagSchemas.js";

export interface TagSetVerificationDiff {
  requestedCount: number;
  actualCount: number;
  missingIds: string[];
  extraIds: string[];
}

export interface TaggedCreateTaskVerificationResult {
  matches: boolean;
  diff: Record<string, unknown>;
  created: TaggedCreatedTaskView | null;
}

export function verifyTaggedCreatedTask(
  expected: CanonicalTaggedCreateTaskPayload,
  actual: { task: TaskView; tagIds: string[] },
): TaggedCreateTaskVerificationResult {
  const taskVerification = verifyCreatedTask(expected, actual.task);
  const tagDiff = buildTagSetVerificationDiff(expected.tagIds, actual.tagIds);
  const tagsMatch = tagDiff.missingIds.length === 0
    && tagDiff.extraIds.length === 0
    && tagDiff.requestedCount === tagDiff.actualCount;
  const created = toTaggedCreatedTaskView(taskVerification.created, actual.tagIds);
  return {
    matches: taskVerification.matches && tagsMatch && created !== null,
    diff: {
      ...taskVerification.diff,
      ...(tagsMatch ? {} : { tagIds: tagDiff }),
    },
    created,
  };
}

export function buildTagSetVerificationDiff(
  requested: readonly string[],
  actual: readonly string[],
): TagSetVerificationDiff {
  const requestedSet = new Set(requested);
  const actualSet = new Set(actual);
  return {
    requestedCount: requested.length,
    actualCount: actual.length,
    missingIds: [...requestedSet]
      .filter(id => !actualSet.has(id))
      .sort(compareCodeUnits)
      .slice(0, 5),
    extraIds: [...actualSet]
      .filter(id => !requestedSet.has(id))
      .sort(compareCodeUnits)
      .slice(0, 5),
  };
}

export function toTaggedCreatedTaskView(
  created: Omit<TaggedCreatedTaskView, "tagIds">,
  actualTagIds: readonly string[],
): TaggedCreatedTaskView | null {
  if (
    actualTagIds.length < 1
    || actualTagIds.length > 5
    || new Set(actualTagIds).size !== actualTagIds.length
  ) return null;
  return {
    ...created,
    tagIds: [...actualTagIds].sort(compareCodeUnits),
  };
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
