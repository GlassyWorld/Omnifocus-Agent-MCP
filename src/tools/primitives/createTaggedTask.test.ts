import { readFile } from "fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalTaggedCreateTaskPayload } from "../../domain/taskCreation/createTaskTagSchemas.js";
import type { JxaJsonExecutor } from "./createInboxTask.js";
import { createTaggedTask, _testExports } from "./createTaggedTask.js";

const payload: CanonicalTaggedCreateTaskPayload = {
  name: "任务 ' \" \\ 📌",
  note: "line 1\nline 2\t中文",
  plannedDate: "2026-07-14T07:00:00.000Z",
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: 30,
  destination: { kind: "inbox" },
  tagIds: ["tag-a", "tag-b"],
};

describe("createTaggedTask hidden primitive", () => {
  it("passes canonical values only as payload data", async () => {
    const execute = vi.fn<JxaJsonExecutor["execute"]>().mockResolvedValue({
      success: true,
      taskId: "task-1",
      destination: { kind: "inbox" },
      tagIds: ["tag-a", "tag-b"],
    });
    await expect(createTaggedTask(payload, { execute })).resolves.toEqual({
      success: true,
      taskId: "task-1",
      destination: { kind: "inbox" },
      tagIds: ["tag-a", "tag-b"],
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("createTaggedTask.js"), {
      destination: { kind: "inbox" },
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: Date.parse(payload.plannedDate!),
      dueDateEpochMs: null,
      deferDateEpochMs: null,
      flagged: false,
      estimatedMinutes: 30,
      tagIds: ["tag-a", "tag-b"],
    });
  });

  it("accepts an exact Project roundtrip and rejects changed placement/tags as postcreate", async () => {
    const projectPayload: CanonicalTaggedCreateTaskPayload = {
      ...payload,
      destination: { kind: "project", projectId: "project-1" },
    };
    await expect(createTaggedTask(projectPayload, {
      execute: async () => ({
        success: true,
        taskId: "task-1",
        destination: { kind: "project", projectId: "project-1" },
        tagIds: ["tag-b", "tag-a"],
      }),
    })).resolves.toMatchObject({ success: true });

    for (const raw of [
      {
        success: true,
        taskId: "task-1",
        destination: { kind: "project", projectId: "other" },
        tagIds: ["tag-a", "tag-b"],
      },
      {
        success: true,
        taskId: "task-1",
        destination: { kind: "project", projectId: "project-1" },
        tagIds: ["tag-a"],
      },
    ]) {
      await expect(createTaggedTask(projectPayload, { execute: async () => raw }))
        .resolves.toEqual({
          success: false,
          phase: "postcreate",
          taskId: "task-1",
          errorCategory: "postcreate_failure",
        });
    }
  });

  it.each([
    ["tag_not_found", "not_found"],
    ["tag_not_allowed", "ancestor_on_hold"],
    ["mutually_exclusive_tags", "mutually_exclusive"],
    ["tag_validation_failed", "parent_cycle"],
    ["project_not_found", "not_found"],
    ["project_not_active", "dropped_ancestor"],
    ["project_validation_failed", "canonical_id_mismatch"],
  ] as const)("preserves trusted %s prewrite failures", async (errorCategory, reason) => {
    await expect(createTaggedTask(payload, {
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

  it("maps untrusted category/reason combinations and malformed output to unknown", async () => {
    await expect(createTaggedTask(payload, {
      execute: async () => ({
        success: false,
        phase: "prewrite",
        errorCategory: "tag_not_found",
        reason: "parent_cycle",
      }),
    })).resolves.toEqual({ success: false, phase: "unknown", errorCategory: "unknown" });
    await expect(createTaggedTask(payload, {
      execute: async () => ({ success: true }),
    })).resolves.toEqual({ success: false, phase: "unknown", errorCategory: "unknown" });
  });

  it("uses fixed Base64-only source and performs all validation before new Task", async () => {
    const source = await readFile(_testExports.scriptPath(), "utf8");
    expect(source).toContain("Data.fromBase64");
    expect(source).toContain("Tag.byIdentifier(requestedId)");
    expect(source).toContain("Task.byIdentifier(projectId)");
    expect(source).toContain("task.addTags(tags)");
    expect(source).toContain("folder = project.parentFolder");
    expect(source).toContain("parent = folder.parent");
    expect(source).toContain("seenFolderIds.has(folderId)");
    expect(source).not.toContain("folder = folder.parentFolder");
    expect(source.indexOf('failureCategory = "project_validation_failed"'))
      .toBeLessThan(source.indexOf("Task.byIdentifier(projectId)"));
    expect(source).toContain("writeStarted = true;\n    const task = project ? new Task");
    expect(source.indexOf("resolveTags(payload.tagIds)")).toBeLessThan(source.indexOf("writeStarted = true"));
    expect(source.indexOf("resolveProject(payload.destination.projectId)")).toBeLessThan(source.indexOf("writeStarted = true"));
    expect(source).not.toContain(payload.name);
    expect(source).not.toContain(payload.note);
    expect(source).not.toContain("new Tag");
    expect(source).not.toMatch(/byName|flattenedTags/);
    expect(source).not.toMatch(/parentTaskId|prepareToken|commitToken/);
  });

  it("documents an exact one-placeholder, bounded Base64 transport", async () => {
    const source = await readFile(_testExports.scriptPath(), "utf8");
    expect(source).toContain("parts.length !== 2");
    expect(source).toContain("/^[A-Za-z0-9+/=]+$/");
    expect(source).toContain("MAX_BASE64_LENGTH");
    const roundTrip = JSON.parse(
      Buffer.from(Buffer.from(JSON.stringify({
        text: "中文 📌 ' \" \\ \n \t",
      }), "utf8").toString("base64"), "base64").toString("utf8"),
    );
    expect(roundTrip).toEqual({ text: "中文 📌 ' \" \\ \n \t" });
  });
});
