import { describe, expect, it } from "vitest";
import type { TaskView } from "../task/taskTypes.js";
import type { CanonicalCreateTaskPayloadV2 } from "./createTaskSchemas.js";
import { verifyCreatedTask } from "./createTaskVerifier.js";

const expected: CanonicalCreateTaskPayloadV2 = {
  name: "Task",
  note: "Note",
  plannedDate: "2026-07-14T07:00:00.000Z",
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: null,
  destination: { kind: "inbox" },
};

const actual: TaskView = {
  id: "task-1",
  name: "Task",
  note: "Note",
  kind: "action",
  status: {
    taskStatus: "Available",
    completion: { direct: false, directDate: null, effectiveDate: null, source: "none" },
    drop: { direct: false, directDate: null, effectiveDate: null, source: "none" },
    flagged: { direct: false, effective: false, source: "none" },
  },
  dates: {
    planned: { direct: "2026-07-14T07:00:00.900Z", effective: "2026-07-14T07:00:00.900Z", source: "direct" },
    due: { direct: null, effective: null, source: "none" },
    defer: { direct: null, effective: null, source: "none" },
  },
  project: null,
  location: { inInbox: true },
  hierarchy: { parentId: null, childIds: [], hasChildren: false, sequential: false, completedByChildren: false },
  tags: ["concurrently-added-tag"],
  repeat: { isRepeating: false, rule: null },
  estimate: { minutes: null },
  timestamps: { created: null, modified: null },
};

describe("create_task exact verifier", () => {
  it("verifies Inbox placement, canonical fields, and direct dates", () => {
    const result = verifyCreatedTask(expected, actual);
    expect(result.matches).toBe(true);
    expect(result.created.location).toEqual({ kind: "inbox" });
    expect(result.created.plannedDate).toBe("2026-07-14T07:00:00.900Z");
  });

  it("does not fail when a tag appears concurrently", () => {
    expect(verifyCreatedTask(expected, actual).diff).not.toHaveProperty("tags");
  });

  it("verifies exact Project placement independently of current Project status", () => {
    const result = verifyCreatedTask(
      { ...expected, destination: { kind: "project", projectId: "project-1" } },
      {
        ...actual,
        location: { inInbox: false },
        project: { id: "project-1", name: "Project" },
      },
    );
    expect(result.matches).toBe(true);
    expect(result.created.location).toEqual({
      kind: "project",
      projectId: "project-1",
      projectName: "Project",
    });
  });

  it("reports placement and property mismatches", () => {
    const result = verifyCreatedTask(expected, {
      ...actual,
      name: "Changed",
      location: { inInbox: false },
      project: { id: "project-1", name: "Project" },
      hierarchy: { ...actual.hierarchy, parentId: "parent-1" },
      dates: {
        ...actual.dates,
        planned: { direct: "2026-07-14T07:00:01.001Z", effective: null, source: "direct" },
      },
    });
    expect(result.matches).toBe(false);
    expect(result.diff).toEqual(expect.objectContaining({
      name: expect.any(Object),
      "location.inInbox": expect.any(Object),
      project: expect.any(Object),
      "hierarchy.parentId": expect.any(Object),
      plannedDate: expect.any(Object),
    }));
  });
});
