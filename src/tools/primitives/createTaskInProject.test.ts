import { readFile } from "fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalCreateTaskPayloadV2 } from "../../domain/taskCreation/createTaskSchemas.js";
import { createTaskInProject, _testExports } from "./createTaskInProject.js";
import type { JxaJsonExecutor } from "./createInboxTask.js";

const payload: CanonicalCreateTaskPayloadV2 & {
  destination: { kind: "project"; projectId: string };
} = {
  name: "Task ' \" \\ 📌",
  note: "line 1\nline 2",
  plannedDate: "2026-07-14T07:00:00.000Z",
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: 30,
  destination: { kind: "project", projectId: "project-1" },
};

describe("createTaskInProject primitive", () => {
  it("passes one exact Project ID and canonical task fields as data", async () => {
    const execute = vi.fn<JxaJsonExecutor["execute"]>().mockResolvedValue({
      success: true,
      taskId: "task-1",
      projectId: "project-1",
    });
    await expect(createTaskInProject(payload, { execute })).resolves.toEqual({
      success: true,
      taskId: "task-1",
      projectId: "project-1",
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("createTaskInProject.js"), {
      projectId: "project-1",
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: Date.parse(payload.plannedDate!),
      dueDateEpochMs: null,
      deferDateEpochMs: null,
      flagged: false,
      estimatedMinutes: 30,
    });
  });

  it("preserves stable prewrite category and reason", async () => {
    await expect(createTaskInProject(payload, {
      execute: async () => ({
        success: false,
        phase: "prewrite",
        taskId: null,
        errorCategory: "project_validation_failed",
        reason: "ancestor_state_unknown",
      }),
    })).resolves.toEqual({
      success: false,
      phase: "prewrite",
      taskId: undefined,
      errorCategory: "project_validation_failed",
      reason: "ancestor_state_unknown",
    });
  });

  it("maps malformed results to an unknown outcome", async () => {
    await expect(createTaskInProject(payload, { execute: async () => ({ success: true }) }))
      .resolves.toEqual({
        success: false,
        phase: "unknown",
        errorCategory: "unknown",
        reason: "schema_drift",
      });
  });

  it("rejects untrusted error-category/reason combinations as unknown", async () => {
    await expect(createTaskInProject(payload, {
      execute: async () => ({
        success: false,
        phase: "prewrite",
        errorCategory: "project_not_found",
        reason: "query_failed",
      }),
    })).resolves.toMatchObject({
      success: false,
      phase: "unknown",
      errorCategory: "unknown",
      reason: "schema_drift",
    });
  });

  it("preserves task ID but reports a mismatched returned Project ID as postcreate", async () => {
    await expect(createTaskInProject(payload, {
      execute: async () => ({ success: true, taskId: "task-1", projectId: "other" }),
    })).resolves.toEqual({
      success: false,
      phase: "postcreate",
      taskId: "task-1",
      errorCategory: "postcreate_failure",
      reason: "canonical_id_mismatch",
    });
  });

  it("uses static payload-file JXA with exact-ID validation and no Inbox fallback", async () => {
    const source = await readFile(_testExports.scriptPath(), "utf8");
    expect(source).toContain("readPayload(argv[0])");
    expect(source).toContain("String(project.id()) === payload.projectId");
    expect(source).toContain("project.tasks.push(task)");
    expect(source).toContain("writeStarted = true");
    expect(source).toContain("dropped_ancestor");
    expect(source).toContain("project.properties().folder");
    expect(source).toContain("properties.hidden");
    expect(source).not.toContain(payload.name);
    expect(source).not.toMatch(/InboxTask|defaultDocument\(\)\.inbox/i);
  });
});
