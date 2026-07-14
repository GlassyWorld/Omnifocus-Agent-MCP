import { createHash } from "crypto";
import {
  CanonicalCreateTaskPayloadV2,
  CREATE_TASK_FINGERPRINT_NAMESPACE,
  CreateTaskInput,
  CreateTaskWarning,
} from "./createTaskSchemas.js";

function canonicalDate(value: string | undefined): string | null {
  return value === undefined ? null : new Date(value).toISOString();
}

export function canonicalizeCreateTaskInput(input: CreateTaskInput): CanonicalCreateTaskPayloadV2 {
  return {
    name: input.name.trim(),
    note: input.note ?? "",
    plannedDate: canonicalDate(input.plannedDate),
    dueDate: canonicalDate(input.dueDate),
    deferDate: canonicalDate(input.deferDate),
    flagged: input.flagged ?? false,
    estimatedMinutes: input.estimatedMinutes ?? null,
    destination: input.destination.kind === "inbox"
      ? { kind: "inbox" }
      : { kind: "project", projectId: input.destination.projectId },
  };
}

export function fingerprintCreateTaskPayload(payload: CanonicalCreateTaskPayloadV2): string {
  return createHash("sha256")
    .update(CREATE_TASK_FINGERPRINT_NAMESPACE)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
}

export function createTaskWarnings(payload: CanonicalCreateTaskPayloadV2): CreateTaskWarning[] {
  const warnings: CreateTaskWarning[] = [];
  if (payload.plannedDate !== null && payload.deferDate !== null) {
    if (Date.parse(payload.plannedDate) < Date.parse(payload.deferDate)) {
      warnings.push({
        code: "planned_before_defer",
        message: "plannedDate is earlier than deferDate.",
      });
    }
  }
  if (payload.plannedDate !== null && payload.dueDate !== null) {
    if (Date.parse(payload.plannedDate) > Date.parse(payload.dueDate)) {
      warnings.push({
        code: "planned_after_due",
        message: "plannedDate is later than dueDate.",
      });
    }
  }
  return warnings;
}
