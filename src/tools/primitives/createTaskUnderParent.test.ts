import { readFile } from "fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalParentCreateTaskPayload } from "../../domain/taskCreation/createParentTaskSchemas.js";
import type { JxaJsonExecutor } from "./createInboxTask.js";
import { createTaskUnderParent, _testExports } from "./createTaskUnderParent.js";

const payload: CanonicalParentCreateTaskPayload = {
  name: "Child ' \" \\ 中文",
  note: "line 1\nline 2",
  plannedDate: "2026-07-15T00:00:00.000Z",
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: 15,
  destination: { kind: "parentTask", parentTaskId: "parent-1" },
  tagIds: ["tag-a", "tag-b"],
};

describe("createTaskUnderParent hidden primitive", () => {
  it("passes canonical values only as fixed-script payload data", async () => {
    const execute = vi.fn<JxaJsonExecutor["execute"]>().mockResolvedValue({
      success: true,
      taskId: "child-1",
      destination: {
        kind: "parentTask",
        parentTaskId: "parent-1",
        projectId: "project-1",
      },
      tagIds: ["tag-b", "tag-a"],
    });
    await expect(createTaskUnderParent(payload, { execute })).resolves.toMatchObject({
      success: true,
      taskId: "child-1",
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("createTaskUnderParent.js"), {
      destination: payload.destination,
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: Date.parse(payload.plannedDate!),
      dueDateEpochMs: null,
      deferDateEpochMs: null,
      flagged: false,
      estimatedMinutes: 15,
      tagIds: ["tag-a", "tag-b"],
    });
  });

  it.each([
    ["parent_not_found", "not_found"],
    ["parent_not_allowed", "unsupported_parent_kind"],
    ["parent_not_active", "ancestor_completed"],
    ["parent_validation_failed", "orphan_parent"],
    ["tag_not_found", "not_found"],
    ["tag_not_allowed", "ancestor_on_hold"],
    ["mutually_exclusive_tags", "mutually_exclusive"],
    ["tag_validation_failed", "parent_cycle"],
  ] as const)("preserves trusted %s prewrite failures", async (errorCategory, reason) => {
    await expect(createTaskUnderParent(payload, {
      execute: async () => ({
        success: false,
        phase: "prewrite",
        taskId: null,
        errorCategory,
        reason,
      }),
    })).resolves.toEqual({
      success: false,
      phase: "prewrite",
      taskId: undefined,
      errorCategory,
      reason,
    });
  });

  it("maps changed destination/tags and malformed failure pairs closed", async () => {
    await expect(createTaskUnderParent(payload, {
      execute: async () => ({
        success: true,
        taskId: "child-1",
        destination: { kind: "parentTask", parentTaskId: "other", projectId: null },
        tagIds: ["tag-a", "tag-b"],
      }),
    })).resolves.toMatchObject({ success: false, phase: "postcreate" });
    await expect(createTaskUnderParent(payload, {
      execute: async () => ({
        success: false,
        phase: "prewrite",
        errorCategory: "parent_not_found",
        reason: "orphan_parent",
      }),
    })).resolves.toEqual({ success: false, phase: "unknown", errorCategory: "unknown" });
  });

  it("keeps validation before the single new Task boundary", async () => {
    const source = await readFile(_testExports.resolveParentCreateScriptPath(), "utf8");
    expect(source).toContain("Data.fromBase64");
    expect(source).toContain("Task.byIdentifier(parentTaskId)");
    expect(source).toContain("Tag.byIdentifier(requestedId)");
    expect(source).toContain("new Task(payload.name, parent)");
    expect(source).toContain("if (tags.length > 0) task.addTags(tags)");
    expect(source.indexOf("resolveParent(payload.destination.parentTaskId)"))
      .toBeLessThan(source.indexOf("resolveTags(payload.tagIds)"));
    expect(source.indexOf("resolveTags(payload.tagIds)"))
      .toBeLessThan(source.indexOf("writeStarted = true"));
    expect(source.indexOf("writeStarted = true"))
      .toBeLessThan(source.indexOf("new Task(payload.name, parent)"));
    expect(source).not.toContain(payload.name);
    expect(source).not.toContain(payload.note);
    expect(source).not.toMatch(/byName|new Tag|prepareToken|commitToken/);
  });
});
