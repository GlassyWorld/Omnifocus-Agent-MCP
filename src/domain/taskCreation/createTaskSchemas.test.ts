import { describe, expect, it } from "vitest";
import { createTaskInputSchema } from "./createTaskSchemas.js";
import {
  canonicalizeCreateTaskInput,
  createTaskWarnings,
  fingerprintCreateTaskPayload,
} from "./createTaskCanonicalizer.js";

describe("create_task V1 input contract", () => {
  it("accepts the minimal Inbox-only input", () => {
    expect(createTaskInputSchema.parse({ name: "  Task  " })).toEqual({ name: "Task" });
  });

  it("accepts all V1 fields", () => {
    expect(createTaskInputSchema.safeParse({
      name: "任务 📌",
      note: "line 1\nline 2",
      plannedDate: "2026-07-14T15:00:00+08:00",
      dueDate: "2026-07-15T15:00:00+08:00",
      deferDate: "2026-07-13T15:00:00+08:00",
      flagged: false,
      estimatedMinutes: 30,
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    }).success).toBe(true);
  });

  it.each([
    { name: "" },
    { name: "   " },
    { name: "x".repeat(501) },
    { name: "task", note: "x".repeat(20_001) },
    { name: "task", dueDate: "2026-07-15" },
    { name: "task", dueDate: "2026-07-15T10:00:00" },
    { name: "task", estimatedMinutes: 0 },
    { name: "task", estimatedMinutes: 1.5 },
    { name: "task", estimatedMinutes: 10_081 },
    { name: "task", projectId: "project-1" },
    { name: "task", destination: { kind: "inbox" } },
    { name: "task", tags: [] },
    { name: "task", note: null },
    { name: "task", idempotencyKey: "not-a-uuid" },
    { name: `bad\ud800` },
  ])("rejects invalid or Phase 2+ input %#", input => {
    expect(createTaskInputSchema.safeParse(input).success).toBe(false);
  });

  it("rejects dueDate earlier than deferDate", () => {
    const result = createTaskInputSchema.safeParse({
      name: "task",
      deferDate: "2026-07-15T12:00:00Z",
      dueDate: "2026-07-15T11:59:59Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("create_task semantic canonicalization", () => {
  it("collapses omitted and explicit defaults", () => {
    const omitted = canonicalizeCreateTaskInput(createTaskInputSchema.parse({ name: " task " }));
    const explicit = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      note: "",
      flagged: false,
    }));
    expect(omitted).toEqual(explicit);
    expect(fingerprintCreateTaskPayload(omitted)).toBe(fingerprintCreateTaskPayload(explicit));
  });

  it("canonicalizes equivalent offsets to the same fingerprint", () => {
    const a = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      dueDate: "2026-07-14T15:00:00+08:00",
    }));
    const b = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      dueDate: "2026-07-14T07:00:00Z",
    }));
    expect(a).toEqual(b);
    expect(fingerprintCreateTaskPayload(a)).toBe(fingerprintCreateTaskPayload(b));
  });

  it("produces planned date warnings without adding warnings to the fingerprint", () => {
    const beforeDefer = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      plannedDate: "2026-07-12T00:00:00Z",
      deferDate: "2026-07-13T00:00:00Z",
      dueDate: "2026-07-14T00:00:00Z",
    }));
    const afterDue = canonicalizeCreateTaskInput(createTaskInputSchema.parse({
      name: "task",
      plannedDate: "2026-07-15T00:00:00Z",
      deferDate: "2026-07-13T00:00:00Z",
      dueDate: "2026-07-14T00:00:00Z",
    }));
    expect(createTaskWarnings(beforeDefer).map(item => item.code)).toEqual(["planned_before_defer"]);
    expect(createTaskWarnings(afterDue).map(item => item.code)).toEqual(["planned_after_due"]);
    expect(fingerprintCreateTaskPayload(beforeDefer)).toHaveLength(64);
  });
});
