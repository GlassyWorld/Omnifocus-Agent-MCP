import { createHash } from "crypto";
import type {
  CanonicalParentCreateTaskPayload,
  ParentCreateTaskInput,
  ParentCreateTaskWarning,
} from "./createParentTaskSchemas.js";

export const PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE = "create_task:v4:parent";
export const TAGGED_PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE =
  "create_task:v4:parent_tagged";

export function canonicalizeParentCreateTaskInput(
  input: ParentCreateTaskInput,
): CanonicalParentCreateTaskPayload {
  return {
    name: input.name.trim(),
    note: input.note ?? "",
    plannedDate: canonicalDate(input.plannedDate),
    dueDate: canonicalDate(input.dueDate),
    deferDate: canonicalDate(input.deferDate),
    flagged: input.flagged ?? false,
    estimatedMinutes: input.estimatedMinutes ?? null,
    destination: {
      kind: "parentTask",
      parentTaskId: input.destination.parentTaskId,
    },
    tagIds: [...(input.tagIds ?? [])].sort(compareCodeUnits),
  };
}

export function fingerprintParentCreateTaskPayload(
  payload: CanonicalParentCreateTaskPayload,
): string {
  const namespace = payload.tagIds.length === 0
    ? PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE
    : TAGGED_PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE;
  return createHash("sha256")
    .update(namespace)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function parentCreateTaskWarnings(
  payload: CanonicalParentCreateTaskPayload,
): ParentCreateTaskWarning[] {
  const warnings: ParentCreateTaskWarning[] = [];
  if (
    payload.plannedDate !== null
    && payload.deferDate !== null
    && Date.parse(payload.plannedDate) < Date.parse(payload.deferDate)
  ) {
    warnings.push({
      code: "planned_before_defer",
      message: "plannedDate is earlier than deferDate.",
    });
  }
  if (
    payload.plannedDate !== null
    && payload.dueDate !== null
    && Date.parse(payload.plannedDate) > Date.parse(payload.dueDate)
  ) {
    warnings.push({
      code: "planned_after_due",
      message: "plannedDate is later than dueDate.",
    });
  }
  return warnings;
}

function canonicalDate(value: string | undefined): string | null {
  return value === undefined ? null : new Date(value).toISOString();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
