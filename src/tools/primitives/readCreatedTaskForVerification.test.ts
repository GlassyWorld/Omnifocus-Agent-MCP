import { describe, expect, it, vi } from "vitest";
import type { RawTask } from "../../domain/task/taskTypes.js";
import { GET_TASK_RAW_FIELDS } from "./getTask.js";
import {
  adaptVerificationTagIds,
  CREATED_TASK_VERIFICATION_FIELDS,
  readCreatedTaskForVerification,
  type VerificationQueryRunner,
} from "./readCreatedTaskForVerification.js";

const rawTask: RawTask = {
  id: "task-1",
  name: "Task",
  note: "",
  taskStatus: "Available",
  flagged: false,
  effectiveFlagged: false,
  completed: false,
  completionDate: null,
  effectiveCompletedDate: null,
  dropDate: null,
  effectiveDropDate: null,
  dueDate: null,
  effectiveDueDate: null,
  deferDate: null,
  effectiveDeferDate: null,
  plannedDate: null,
  effectivePlannedDate: null,
  tagNames: ["Synthetic"],
  projectName: null,
  projectId: null,
  inInbox: true,
  isProjectRoot: false,
  parentId: null,
  childIds: [],
  hasChildren: false,
  sequential: false,
  completedByChildren: false,
  isRepeating: false,
  repetitionRule: null,
  estimatedMinutes: null,
  creationDate: null,
  modificationDate: null,
};

describe("mutation-only created Task verification read", () => {
  it("queries one exact task with existing fields plus raw canonical Tag IDs", async () => {
    const runner = vi.fn<VerificationQueryRunner>().mockResolvedValue({
      success: true,
      items: [{ ...rawTask, tags: ["tag-b", "tag-a"] }],
      count: 1,
    });
    await expect(readCreatedTaskForVerification("task-1", runner)).resolves.toMatchObject({
      success: true,
      value: {
        task: { id: "task-1", tags: ["Synthetic"] },
        tagIds: ["tag-a", "tag-b"],
      },
    });
    expect(runner).toHaveBeenCalledWith({
      entity: "tasks",
      filters: { taskId: "task-1" },
      fields: [...GET_TASK_RAW_FIELDS, "tags"],
      includeCompleted: true,
      limit: 2,
    });
    expect(GET_TASK_RAW_FIELDS).not.toContain("tags");
    expect(CREATED_TASK_VERIFICATION_FIELDS.at(-1)).toBe("tags");
  });

  it("does not impose an item-count maximum", () => {
    const ids = Array.from({ length: 300 }, (_, index) => `tag-${String(index).padStart(3, "0")}`);
    expect(adaptVerificationTagIds(ids)).toEqual({ success: true, tagIds: ids });
  });

  it.each([
    null,
    "tag-1",
    [""],
    ["tag-1", 2],
    ["tag-1", "tag-1"],
  ])("fails closed for malformed or duplicate raw IDs %#", input => {
    expect(adaptVerificationTagIds(input)).toEqual({ success: false });
  });

  it("distinguishes query/not-exact/task/tag read failures", async () => {
    await expect(readCreatedTaskForVerification("task-1", async () => ({ success: false })))
      .resolves.toEqual({ success: false, reason: "query_failed", taskExists: false });
    await expect(readCreatedTaskForVerification("task-1", async () => ({ success: true, items: [] })))
      .resolves.toEqual({ success: false, reason: "not_exact", taskExists: false });
    await expect(readCreatedTaskForVerification("task-1", async () => ({
      success: true,
      items: [{ ...rawTask, name: null, tags: ["tag-1"] }],
    }))).resolves.toEqual({ success: false, reason: "task_schema_drift", taskExists: true });
    await expect(readCreatedTaskForVerification("task-1", async () => ({
      success: true,
      items: [{ ...rawTask, tags: ["tag-1", "tag-1"] }],
    }))).resolves.toEqual({ success: false, reason: "tag_schema_drift", taskExists: true });
  });
});
