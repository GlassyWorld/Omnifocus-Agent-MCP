import type { TaskView } from "../task/taskTypes.js";
import { buildTagSetVerificationDiff } from "./createTaggedTaskVerifier.js";
import type {
  CanonicalParentCreateTaskPayload,
  ParentCreatedTaskView,
} from "./createParentTaskSchemas.js";
import type { ParentTaskFacts } from "./parentDestination.js";
import { isTaskUnderOrdinaryParent } from "./parentTaskPlacementSemantics.js";

export interface ParentCreateTaskVerificationResult {
  matches: boolean;
  diff: Record<string, unknown>;
  created: ParentCreatedTaskView | null;
}

export function verifyParentCreatedTask(
  expected: CanonicalParentCreateTaskPayload,
  actual: { task: TaskView; tagIds: string[] },
  parentFacts: ParentTaskFacts,
): ParentCreateTaskVerificationResult {
  const diff: Record<string, unknown> = {};
  const compare = (field: string, expectedValue: unknown, actualValue: unknown) => {
    if (expectedValue !== actualValue) {
      diff[field] = { expected: expectedValue, actual: actualValue };
    }
  };

  compare("name", expected.name, actual.task.name);
  compare("note", expected.note, actual.task.note);
  compare("kind", "action", actual.task.kind);
  const projectId = parentFacts.project?.id ?? null;
  if (!isTaskUnderOrdinaryParent(
    actual.task,
    expected.destination.parentTaskId,
    projectId,
  )) {
    compare("location.inInbox", false, actual.task.location.inInbox);
    compare("hierarchy.parentId", expected.destination.parentTaskId, actual.task.hierarchy.parentId);
    compare("project.id", projectId, actual.task.project?.id ?? null);
  }
  compare("flagged", expected.flagged, actual.task.status.flagged.direct);
  compare("estimatedMinutes", expected.estimatedMinutes, actual.task.estimate.minutes);

  for (const [field, expectedDate, actualDate] of [
    ["plannedDate", expected.plannedDate, actual.task.dates.planned.direct],
    ["dueDate", expected.dueDate, actual.task.dates.due.direct],
    ["deferDate", expected.deferDate, actual.task.dates.defer.direct],
  ] as const) {
    if (!datesMatch(expectedDate, actualDate)) {
      diff[field] = {
        expected: normalizedInstant(expectedDate),
        actual: normalizedInstant(actualDate),
      };
    }
  }

  let tagIds: string[] | undefined;
  if (expected.tagIds.length > 0) {
    const tagDiff = buildTagSetVerificationDiff(expected.tagIds, actual.tagIds);
    if (
      tagDiff.requestedCount !== tagDiff.actualCount
      || tagDiff.missingIds.length > 0
      || tagDiff.extraIds.length > 0
    ) diff.tagIds = tagDiff;
    if (
      actual.tagIds.length < 1
      || actual.tagIds.length > 5
      || new Set(actual.tagIds).size !== actual.tagIds.length
    ) {
      return { matches: false, diff, created: null };
    }
    tagIds = [...actual.tagIds].sort(compareCodeUnits);
  }

  const created: ParentCreatedTaskView = {
    id: actual.task.id,
    name: actual.task.name,
    note: actual.task.note,
    location: {
      kind: "parentTask",
      parentTaskId: parentFacts.id,
      parentTaskName: parentFacts.name,
      projectId,
      projectName: parentFacts.project?.name ?? null,
    },
    plannedDate: normalizedInstant(actual.task.dates.planned.direct),
    dueDate: normalizedInstant(actual.task.dates.due.direct),
    deferDate: normalizedInstant(actual.task.dates.defer.direct),
    flagged: actual.task.status.flagged.direct,
    estimatedMinutes: actual.task.estimate.minutes,
    ...(tagIds === undefined ? {} : { tagIds }),
  };
  return { matches: Object.keys(diff).length === 0, diff, created };
}

function datesMatch(expected: string | null, actual: string | null): boolean {
  if (expected === null || actual === null) return expected === actual;
  return Math.abs(Date.parse(expected) - Date.parse(actual)) <= 1_000;
}

function normalizedInstant(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
