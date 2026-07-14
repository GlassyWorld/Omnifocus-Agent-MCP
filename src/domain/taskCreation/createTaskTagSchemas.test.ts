import { describe, expect, it } from "vitest";
import {
  inputSchema as registeredCreateTaskInputSchema,
  outputSchema as registeredCreateTaskOutputSchema,
} from "../../tools/definitions/createTask.js";
import {
  canonicalizeCreateTaskInput,
  canonicalizeTaggedCreateTaskInput,
  fingerprintCreateTaskPayload,
  fingerprintTaggedCreateTaskPayload,
  TAGGED_CREATE_TASK_FINGERPRINT_NAMESPACE,
} from "./createTaskCanonicalizer.js";
import { createTaskInputSchema } from "./createTaskSchemas.js";
import {
  createTaskInputSchemaV3,
  createTaskPublicSuccessSchemaV3,
  createTaskPublicInputSchemaV3,
  hasTagAssignment,
  taggedCreateTaskSuccessSchema,
  tagIdsWireSchema,
} from "./createTaskTagSchemas.js";

const key = "123e4567-e89b-42d3-a456-426614174000";

describe("create_task V3 contract", () => {
  it("keeps the wire Tag property as a plain bounded ZodArray", () => {
    expect(tagIdsWireSchema.safeParse(["tag-1"]).success).toBe(true);
    expect(tagIdsWireSchema.safeParse([]).success).toBe(false);
    expect(tagIdsWireSchema.safeParse(["1", "2", "3", "4", "5", "6"]).success).toBe(false);
    // Uniqueness is intentionally a runtime-object relation, not a wire-array effect.
    expect(tagIdsWireSchema.safeParse(["tag-1", "tag-1"]).success).toBe(true);
  });

  it("accepts omitted or 1-5 unique IDs and rejects duplicates/aliases", () => {
    const base = { name: "Task", destination: { kind: "inbox" as const } };
    expect(createTaskInputSchemaV3.safeParse(base).success).toBe(true);
    expect(createTaskInputSchemaV3.safeParse({ ...base, tagIds: ["tag-1"] }).success).toBe(true);
    expect(createTaskInputSchemaV3.safeParse({
      ...base,
      tagIds: ["tag-1", "tag-2", "tag-3", "tag-4", "tag-5"],
    }).success).toBe(true);
    expect(createTaskInputSchemaV3.safeParse({ ...base, tagIds: [] }).success).toBe(false);
    expect(createTaskInputSchemaV3.safeParse({ ...base, tagIds: ["tag-1", "tag-1"] }).success).toBe(false);
    expect(createTaskInputSchemaV3.safeParse({ ...base, tagNames: ["Work"] }).success).toBe(false);
    expect(createTaskInputSchemaV3.safeParse({ ...base, autoCreateTags: true }).success).toBe(false);
  });

  it("requires the UUID only in the internal future-public schema", () => {
    const input = { name: "Task", destination: { kind: "inbox" as const }, tagIds: ["tag-1"] };
    expect(createTaskInputSchemaV3.safeParse(input).success).toBe(true);
    expect(createTaskPublicInputSchemaV3.safeParse(input).success).toBe(false);
    expect(createTaskPublicInputSchemaV3.safeParse({ ...input, idempotencyKey: key }).success).toBe(true);
  });

  it("publishes tagIds while retaining strict runtime rejection of aliases", () => {
    const tagged = {
      name: "Task",
      destination: { kind: "inbox" as const },
      idempotencyKey: key,
      tagIds: ["tag-1"],
    };
    expect(createTaskInputSchema.safeParse(tagged).success).toBe(false);
    expect(registeredCreateTaskInputSchema.safeParse(tagged).success).toBe(true);
    expect(registeredCreateTaskInputSchema.safeParse({ ...tagged, tagNames: ["Work"] }).success)
      .toBe(false);
    expect(Object.keys(registeredCreateTaskOutputSchema)).toContain("created");
  });

  it("uses split fingerprints while preserving the exact no-tag V2 hash", () => {
    expect(TAGGED_CREATE_TASK_FINGERPRINT_NAMESPACE).toBe("create_task:v3:tagged");
    const noTagInput = createTaskInputSchema.parse({
      name: " Task ",
      destination: { kind: "inbox" },
    });
    const noTagCanonical = canonicalizeCreateTaskInput(noTagInput);
    const before = fingerprintCreateTaskPayload(noTagCanonical);

    const taggedA = createTaskInputSchemaV3.parse({
      name: " Task ",
      destination: { kind: "inbox" },
      tagIds: ["tag-b", "tag-a"],
    });
    const taggedB = createTaskInputSchemaV3.parse({
      name: "Task",
      note: "",
      flagged: false,
      destination: { kind: "inbox" },
      tagIds: ["tag-a", "tag-b"],
    });
    if (!hasTagAssignment(taggedA) || !hasTagAssignment(taggedB)) throw new Error("tagged fixture");
    const canonicalA = canonicalizeTaggedCreateTaskInput(taggedA);
    const canonicalB = canonicalizeTaggedCreateTaskInput(taggedB);
    expect(canonicalA.tagIds).toEqual(["tag-a", "tag-b"]);
    expect(canonicalA).toEqual(canonicalB);
    expect(fingerprintTaggedCreateTaskPayload(canonicalA))
      .toBe(fingerprintTaggedCreateTaskPayload(canonicalB));
    expect(fingerprintTaggedCreateTaskPayload(canonicalA)).not.toBe(before);
    expect(fingerprintCreateTaskPayload(canonicalizeCreateTaskInput(noTagInput))).toBe(before);
  });

  it("requires actual 1-5 unique IDs in tagged success output", () => {
    const base = {
      success: true as const,
      created: {
        id: "task-1",
        name: "Task",
        note: "",
        location: { kind: "inbox" as const },
        plannedDate: null,
        dueDate: null,
        deferDate: null,
        flagged: false,
        estimatedMinutes: null,
      },
      idempotency: {
        key,
        replayed: false,
        replayUntil: "2026-07-15T00:00:00.000Z",
      },
      warnings: [],
    };
    expect(taggedCreateTaskSuccessSchema.safeParse({
      ...base,
      created: { ...base.created, tagIds: ["tag-1"] },
    }).success).toBe(true);
    expect(taggedCreateTaskSuccessSchema.safeParse(base).success).toBe(false);
    expect(taggedCreateTaskSuccessSchema.safeParse({
      ...base,
      created: { ...base.created, tagIds: [] },
    }).success).toBe(false);
    expect(createTaskPublicSuccessSchemaV3.safeParse(base).success).toBe(true);
    expect(createTaskPublicSuccessSchemaV3.safeParse({
      ...base,
      created: { ...base.created, tagIds: ["tag-1"] },
    }).success).toBe(true);
  });
});
