import { describe, expect, it } from "vitest";
import {
  canonicalizeParentCreateTaskInput,
  fingerprintParentCreateTaskPayload,
  PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE,
  TAGGED_PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE,
} from "./createParentTaskCanonicalizer.js";
import {
  createTaskInputSchemaV4,
  createTaskOutputSchemaV4,
  createTaskPublicInputSchemaV4,
  hasParentDestination,
  parentCreateTaskInputSchema,
  parentCreateTaskSuccessWithoutTagsSchema,
  taggedParentCreateTaskSuccessSchema,
} from "./createParentTaskSchemas.js";

const input = {
  name: "  Child  ",
  destination: { kind: "parentTask" as const, parentTaskId: "parent-1" },
};

describe("internal Parent create schema and canonicalization", () => {
  it("accepts only a strict parentTask destination", () => {
    expect(parentCreateTaskInputSchema.parse(input).destination).toEqual({
      kind: "parentTask",
      parentTaskId: "parent-1",
    });
    expect(parentCreateTaskInputSchema.safeParse({
      ...input,
      destination: { ...input.destination, projectId: "project-1" },
    }).success).toBe(false);
    expect(parentCreateTaskInputSchema.safeParse({
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    }).success).toBe(false);
  });

  it("publishes a strict V4 three-way destination without competing fields", () => {
    for (const destination of [
      { kind: "inbox" },
      { kind: "project", projectId: "project-1" },
      { kind: "parentTask", parentTaskId: "parent-1" },
    ]) {
      expect(createTaskPublicInputSchemaV4.safeParse({
        name: "Task",
        destination,
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      }).success).toBe(true);
    }
    for (const destination of [
      { kind: "parentTask", parentTaskId: "parent-1", projectId: "project-1" },
      { kind: "project", projectId: "project-1", parentTaskId: "parent-1" },
      { kind: "parentTask", parentTaskName: "Parent" },
    ]) {
      expect(createTaskPublicInputSchemaV4.safeParse({
        name: "Task",
        destination,
        idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
      }).success).toBe(false);
    }
  });

  it("detects the Parent destination independently of optional Tags", () => {
    expect(hasParentDestination(createTaskInputSchemaV4.parse(input))).toBe(true);
    expect(hasParentDestination(createTaskInputSchemaV4.parse({
      ...input,
      tagIds: ["tag-a"],
    }))).toBe(true);
    expect(hasParentDestination(createTaskInputSchemaV4.parse({
      name: "Task",
      destination: { kind: "inbox" },
    }))).toBe(false);
  });

  it("keeps Parent success parsing branch-specific while V4 output is compact", () => {
    const base = {
      success: true as const,
      created: {
        id: "child-1",
        name: "Child",
        note: "",
        location: {
          kind: "parentTask" as const,
          parentTaskId: "parent-1",
          parentTaskName: "Parent",
          projectId: null,
          projectName: null,
        },
        plannedDate: null,
        dueDate: null,
        deferDate: null,
        flagged: false,
        estimatedMinutes: null,
      },
      idempotency: {
        key: "123e4567-e89b-42d3-a456-426614174000",
        replayed: false,
        replayUntil: "2026-07-16T00:00:00.000Z",
      },
      warnings: [],
    };
    expect(parentCreateTaskSuccessWithoutTagsSchema.safeParse(base).success).toBe(true);
    expect(parentCreateTaskSuccessWithoutTagsSchema.safeParse({
      ...base,
      created: { ...base.created, tagIds: ["tag-a"] },
    }).success).toBe(false);
    expect(taggedParentCreateTaskSuccessSchema.safeParse(base).success).toBe(false);
    expect(taggedParentCreateTaskSuccessSchema.safeParse({
      ...base,
      created: { ...base.created, tagIds: ["tag-a"] },
    }).success).toBe(true);
    expect(Object.keys(createTaskOutputSchemaV4).sort()).toEqual([
      "created",
      "idempotency",
      "success",
      "warnings",
    ]);
  });

  it("canonicalizes optional fields and sorts unique Tag IDs", () => {
    const canonical = canonicalizeParentCreateTaskInput(parentCreateTaskInputSchema.parse({
      ...input,
      plannedDate: "2026-07-15T08:00:00+08:00",
      tagIds: ["tag-b", "tag-a"],
    }));
    expect(canonical).toMatchObject({
      name: "Child",
      note: "",
      plannedDate: "2026-07-15T00:00:00.000Z",
      flagged: false,
      estimatedMinutes: null,
      destination: { kind: "parentTask", parentTaskId: "parent-1" },
      tagIds: ["tag-a", "tag-b"],
    });
  });

  it("rejects duplicate Tags and uses distinct tagged/untagged namespaces", () => {
    expect(parentCreateTaskInputSchema.safeParse({
      ...input,
      tagIds: ["tag-a", "tag-a"],
    }).success).toBe(false);
    const plain = canonicalizeParentCreateTaskInput(parentCreateTaskInputSchema.parse(input));
    const tagged = canonicalizeParentCreateTaskInput(parentCreateTaskInputSchema.parse({
      ...input,
      tagIds: ["tag-a"],
    }));
    expect(PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE).toBe("create_task:v4:parent");
    expect(TAGGED_PARENT_CREATE_TASK_FINGERPRINT_NAMESPACE).toBe(
      "create_task:v4:parent_tagged",
    );
    expect(fingerprintParentCreateTaskPayload(plain)).not.toBe(
      fingerprintParentCreateTaskPayload(tagged),
    );
  });
});
