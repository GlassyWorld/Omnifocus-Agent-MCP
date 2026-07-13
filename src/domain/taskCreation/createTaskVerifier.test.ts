import { describe, expect, it } from "vitest";
import { TaskView } from "../task/taskTypes.js";
import { CanonicalCreateTaskPayload } from "./createTaskSchemas.js";
import { verifyCreatedInboxTask } from "./createTaskVerifier.js";

const expected: CanonicalCreateTaskPayload = {
  name: "Task",
  note: "Note",
  plannedDate: "2026-07-14T07:00:00.000Z",
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: null,
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
  it("uses canonical state, direct dates, and a one-second tolerance", () => {
    const result = verifyCreatedInboxTask(expected, actual);
    expect(result.matches).toBe(true);
    expect(result.created).toEqual({
      id: "task-1",
      name: "Task",
      note: "Note",
      location: { kind: "inbox" },
      plannedDate: "2026-07-14T07:00:00.900Z",
      dueDate: null,
      deferDate: null,
      flagged: false,
      estimatedMinutes: null,
    });
  });

  it("does not fail when a tag appears concurrently", () => {
    expect(verifyCreatedInboxTask(expected, actual).diff).not.toHaveProperty("tags");
  });

  it("reports placement and property mismatches", () => {
    const result = verifyCreatedInboxTask(expected, {
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
