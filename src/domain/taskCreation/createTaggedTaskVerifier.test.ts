import { describe, expect, it } from "vitest";
import type { TaskView } from "../task/taskTypes.js";
import type { CanonicalTaggedCreateTaskPayload } from "./createTaskTagSchemas.js";
import {
  buildTagSetVerificationDiff,
  toTaggedCreatedTaskView,
  verifyTaggedCreatedTask,
} from "./createTaggedTaskVerifier.js";

const expected: CanonicalTaggedCreateTaskPayload = {
  name: "Task",
  note: "",
  plannedDate: null,
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: null,
  destination: { kind: "inbox" },
  tagIds: ["tag-a", "tag-b"],
};

const task: TaskView = {
  id: "task-1",
  name: "Task",
  note: "",
  kind: "action",
  status: {
    taskStatus: "Available",
    completion: { direct: false, directDate: null, effectiveDate: null, source: "none" },
    drop: { direct: false, directDate: null, effectiveDate: null, source: "none" },
    flagged: { direct: false, effective: false, source: "none" },
  },
  dates: {
    planned: { direct: null, effective: null, source: "none" },
    due: { direct: null, effective: null, source: "none" },
    defer: { direct: null, effective: null, source: "none" },
  },
  project: null,
  location: { inInbox: true },
  hierarchy: {
    parentId: null,
    childIds: [],
    hasChildren: false,
    sequential: false,
    completedByChildren: false,
  },
  tags: ["display name only"],
  repeat: { isRepeating: false, rule: null },
  estimate: { minutes: null },
  timestamps: { created: null, modified: null },
};

describe("tagged create_task exact verifier", () => {
  it("matches the exact Tag set independent of order and returns actual IDs", () => {
    const result = verifyTaggedCreatedTask(expected, {
      task,
      tagIds: ["tag-b", "tag-a"],
    });
    expect(result.matches).toBe(true);
    expect(result.diff).toEqual({});
    expect(result.created?.tagIds).toEqual(["tag-a", "tag-b"]);
  });

  it("uses the frozen bounded diff for missing and extra IDs", () => {
    expect(buildTagSetVerificationDiff(
      ["requested-2", "requested-1"],
      ["extra-9", "extra-8", "extra-7", "extra-6", "extra-5", "extra-4"],
    )).toEqual({
      requestedCount: 2,
      actualCount: 6,
      missingIds: ["requested-1", "requested-2"],
      extraIds: ["extra-4", "extra-5", "extra-6", "extra-7", "extra-8"],
    });
  });

  it.each([
    [[]],
    [["tag-a"]],
    [["tag-a", "tag-b", "tag-c", "tag-d", "tag-e", "tag-f"]],
  ] as const)("rejects an actual out-of-contract or mismatched set %#", tagIds => {
    const result = verifyTaggedCreatedTask(expected, { task, tagIds });
    expect(result.matches).toBe(false);
    expect(result.diff).toHaveProperty("tagIds");
    if (tagIds.length === 0 || tagIds.length > 5) expect(result.created).toBeNull();
  });

  it("combines existing Task field/placement differences with Tag differences", () => {
    const result = verifyTaggedCreatedTask(expected, {
      task: { ...task, name: "Changed" },
      tagIds: ["other"],
    });
    expect(result.matches).toBe(false);
    expect(result.diff).toHaveProperty("name");
    expect(result.diff).toHaveProperty("tagIds");
  });

  it("builds compact replay output only for 1-5 unique current IDs", () => {
    const base = verifyTaggedCreatedTask(expected, { task, tagIds: ["tag-a", "tag-b"] }).created!;
    const { tagIds: _ignored, ...createdWithoutTags } = base;
    expect(toTaggedCreatedTaskView(createdWithoutTags, ["current"])).toMatchObject({
      tagIds: ["current"],
    });
    expect(toTaggedCreatedTaskView(createdWithoutTags, [])).toBeNull();
    expect(toTaggedCreatedTaskView(createdWithoutTags, ["a", "b", "c", "d", "e", "f"])).toBeNull();
    expect(toTaggedCreatedTaskView(createdWithoutTags, ["same", "same"])).toBeNull();
  });
});
