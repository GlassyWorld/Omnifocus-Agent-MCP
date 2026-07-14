import { readFile } from "fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { CanonicalCreateTaskPayloadV2 } from "../../domain/taskCreation/createTaskSchemas.js";
import { createInboxTask, type JxaJsonExecutor, _testExports } from "./createInboxTask.js";

const payload: CanonicalCreateTaskPayloadV2 = {
  name: "Task ' \" \\ 📌",
  note: "line 1\nline 2",
  plannedDate: "2026-07-14T07:00:00.000Z",
  dueDate: "2026-07-15T07:00:00.000Z",
  deferDate: null,
  flagged: false,
  estimatedMinutes: 30,
  destination: { kind: "inbox" },
};

describe("createInboxTask primitive", () => {
  it("passes only canonical Inbox task properties with epoch milliseconds", async () => {
    const execute = vi.fn<JxaJsonExecutor["execute"]>().mockResolvedValue({
      success: true,
      taskId: "task-1",
    });
    await expect(createInboxTask(payload, { execute })).resolves.toEqual({
      success: true,
      taskId: "task-1",
    });
    expect(execute).toHaveBeenCalledWith(expect.stringContaining("createInboxTask.js"), {
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: Date.parse(payload.plannedDate!),
      dueDateEpochMs: Date.parse(payload.dueDate!),
      deferDateEpochMs: null,
      flagged: false,
      estimatedMinutes: 30,
    });
    const sent = execute.mock.calls[0][1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("destination");
    expect(sent).not.toHaveProperty("projectId");
    expect(sent).not.toHaveProperty("tags");
  });

  it("preserves typed prewrite and postcreate failures", async () => {
    for (const phase of ["prewrite", "postcreate"] as const) {
      const execute = vi.fn().mockResolvedValue({
        success: false,
        phase,
        taskId: phase === "postcreate" ? "task-1" : null,
        errorCategory: `${phase}_failure`,
      });
      const result = await createInboxTask(payload, { execute });
      expect(result).toMatchObject({ success: false, phase });
    }
  });

  it("maps malformed process results to unknown outcome", async () => {
    await expect(createInboxTask(payload, { execute: async () => ({ success: true }) }))
      .resolves.toEqual({
        success: false,
        phase: "unknown",
        errorCategory: "malformed_process_result",
      });
  });

  it("uses a static JXA source that never contains task data or placement features", async () => {
    const source = await readFile(_testExports.scriptPath(), "utf8");
    expect(source).toContain("new Date(epochMilliseconds)");
    expect(source).toContain("app.InboxTask(properties)");
    expect(source).not.toContain(payload.name);
    expect(source).not.toMatch(/project|parent|tag/i);
  });

  it("treats equivalent offset instants as the same epoch", () => {
    expect(_testExports.toEpochMilliseconds("2026-07-14T15:00:00+08:00"))
      .toBe(_testExports.toEpochMilliseconds("2026-07-14T07:00:00Z"));
  });
});
