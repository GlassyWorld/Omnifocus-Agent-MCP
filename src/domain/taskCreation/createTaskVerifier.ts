import { TaskView } from "../task/taskTypes.js";
import {
  CanonicalCreateTaskPayload,
  CreatedTaskView,
} from "./createTaskSchemas.js";

export interface CreateTaskVerificationResult {
  matches: boolean;
  diff: Record<string, { expected: unknown; actual: unknown }>;
  created: CreatedTaskView;
}

function normalizedInstant(value: string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function datesMatch(expected: string | null, actual: string | null): boolean {
  if (expected === null || actual === null) return expected === actual;
  return Math.abs(Date.parse(expected) - Date.parse(actual)) <= 1_000;
}

export function verifyCreatedInboxTask(
  expected: CanonicalCreateTaskPayload,
  actual: TaskView,
): CreateTaskVerificationResult {
  const diff: Record<string, { expected: unknown; actual: unknown }> = {};
  const compare = (field: string, expectedValue: unknown, actualValue: unknown) => {
    if (expectedValue !== actualValue) {
      diff[field] = { expected: expectedValue, actual: actualValue };
    }
  };

  compare("name", expected.name, actual.name);
  compare("note", expected.note, actual.note);
  compare("kind", "action", actual.kind);
  compare("location.inInbox", true, actual.location.inInbox);
  compare("project", null, actual.project);
  compare("hierarchy.parentId", null, actual.hierarchy.parentId);
  compare("flagged", expected.flagged, actual.status.flagged.direct);
  compare("estimatedMinutes", expected.estimatedMinutes, actual.estimate.minutes);

  const datePairs = [
    ["plannedDate", expected.plannedDate, actual.dates.planned.direct],
    ["dueDate", expected.dueDate, actual.dates.due.direct],
    ["deferDate", expected.deferDate, actual.dates.defer.direct],
  ] as const;
  for (const [field, expectedDate, actualDate] of datePairs) {
    if (!datesMatch(expectedDate, actualDate)) {
      diff[field] = {
        expected: normalizedInstant(expectedDate),
        actual: normalizedInstant(actualDate),
      };
    }
  }

  return {
    matches: Object.keys(diff).length === 0,
    diff,
    created: {
      id: actual.id,
      name: actual.name,
      note: actual.note,
      location: { kind: "inbox" },
      plannedDate: normalizedInstant(actual.dates.planned.direct),
      dueDate: normalizedInstant(actual.dates.due.direct),
      deferDate: normalizedInstant(actual.dates.defer.direct),
      flagged: actual.status.flagged.direct,
      estimatedMinutes: actual.estimate.minutes,
    },
  };
}

export const _testExports = { datesMatch, normalizedInstant };
