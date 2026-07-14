import { describe, expect, it } from "vitest";
import {
  CREATE_TASK_FINGERPRINT_NAMESPACE,
  createTaskInputSchema,
} from "./createTaskSchemas.js";
import {
  canonicalizeCreateTaskInput,
  createTaskWarnings,
  fingerprintCreateTaskPayload,
} from "./createTaskCanonicalizer.js";

const inbox = { kind: "inbox" as const };

describe("create_task V2 input contract", () => {
  it("requires an explicit Inbox destination", () => {
    expect(createTaskInputSchema.parse({ name: "  Task  ", destination: inbox })).toEqual({
      name: "Task",
      destination: inbox,
    });
    expect(createTaskInputSchema.safeParse({ name: "Task" }).success).toBe(false);
  });

  it("accepts all V2 fields and an opaque canonical Project ID", () => {
    expect(createTaskInputSchema.safeParse({
      name: "任务 📌",
      note: "line 1\nline 2",
      plannedDate: "2026-07-14T15:00:00+08:00",
      dueDate: "2026-07-15T15:00:00+08:00",
      deferDate: "2026-07-13T15:00:00+08:00",
      flagged: false,
      estimatedMinutes: 30,
      destination: { kind: "project", projectId: "opaque canonical id" },
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    }).success).toBe(true);
  });

  it.each([
    { name: "", destination: inbox },
    { name: "   ", destination: inbox },
    { name: "x".repeat(501), destination: inbox },
    { name: "task", note: "x".repeat(20_001), destination: inbox },
    { name: "task", dueDate: "2026-07-15", destination: inbox },
    { name: "task", dueDate: "2026-07-15T10:00:00", destination: inbox },
    { name: "task", estimatedMinutes: 0, destination: inbox },
    { name: "task", estimatedMinutes: 1.5, destination: inbox },
    { name: "task", estimatedMinutes: 10_081, destination: inbox },
    { name: "task", projectId: "project-1", destination: inbox },
    { name: "task", destination: { kind: "project", projectId: "" } },
    { name: "task", destination: { kind: "project", projectName: "Project" } },
    { name: "task", destination: { kind: "other" } },
    { name: "task", destination: inbox, tags: [] },
    { name: "task", destination: inbox, note: null },
    { name: "task", destination: inbox, idempotencyKey: "not-a-uuid" },
    { name: `bad\ud800`, destination: inbox },
  ])("rejects invalid or out-of-scope input %#", input => {
    expect(createTaskInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects dueDate earlier than deferDate", () => {
    const result = createTaskInputSchema.safeParse({
      name: "task",
      destination: inbox,
      deferDate: "2026-07-15T12:00:00Z",
      dueDate: "2026-07-15T11:59:59Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("create_task V2 semantic canonicalization", () => {
  it("uses the V2 namespace and collapses omitted and explicit defaults", () => {
    expect(CREATE_TASK_FINGERPRINT_NAMESPACE).toBe("create_task:v2");
    const omitted = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: " task ",
      destination: inbox,
    }));
    const explicit = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      note: "",
      flagged: false,
      destination: inbox,
    }));
    expect(omitted).toEqual(explicit);
    expect(fingerprintCreateTaskPayload(omitted)).toBe(fingerprintCreateTaskPayload(explicit));
  });

  it("canonicalizes equivalent offsets to the same fingerprint", () => {
    const a = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      destination: inbox,
      dueDate: "2026-07-14T15:00:00+08:00",
    }));
    const b = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      destination: inbox,
      dueDate: "2026-07-14T07:00:00Z",
    }));
    expect(a).toEqual(b);
    expect(fingerprintCreateTaskPayload(a)).toBe(fingerprintCreateTaskPayload(b));
  });

  it("binds destination kind and exact Project ID into the fingerprint", () => {
    const inboxPayload = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      destination: inbox,
    }));
    const projectPayload = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      destination: { kind: "project", projectId: "project-1" },
    }));
    expect(fingerprintCreateTaskPayload(inboxPayload)).not.toBe(fingerprintCreateTaskPayload(projectPayload));
  });

  it("produces planned date warnings without adding warnings to the fingerprint", () => {
    const beforeDefer = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      destination: inbox,
      plannedDate: "2026-07-12T00:00:00Z",
      deferDate: "2026-07-13T00:00:00Z",
      dueDate: "2026-07-14T00:00:00Z",
    }));
    const afterDue = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      destination: inbox,
      plannedDate: "2026-07-15T00:00:00Z",
      deferDate: "2026-07-13T00:00:00Z",
      dueDate: "2026-07-14T00:00:00Z",
    }));
    expect(createTaskWarnings(beforeDefer).map(item => item.code)).toEqual(["planned_before_defer"]);
    expect(createTaskWarnings(afterDue).map(item => item.code)).toEqual(["planned_after_due"]);
    expect(fingerprintCreateTaskPayload(beforeDefer)).toHaveLength(64);
  });
});
