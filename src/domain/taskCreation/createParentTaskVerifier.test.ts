import { describe, expect, it } from "vitest";
import type { TaskView } from "../task/taskTypes.js";
import type { CanonicalParentCreateTaskPayload } from "./createParentTaskSchemas.js";
import { verifyParentCreatedTask } from "./createParentTaskVerifier.js";
import type { ParentTaskFacts } from "./parentDestination.js";

const expected: CanonicalParentCreateTaskPayload = {
  name: "Child",
  note: "",
  plannedDate: null,
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: null,
  destination: { kind: "parentTask", parentTaskId: "parent-1" },
  tagIds: [],
};

const parentFacts: ParentTaskFacts = {
  id: "parent-1",
  name: "Parent",
  kind: "action_group",
  taskStatus: "Available",
  completion: { direct: false, effectiveDate: null },
  drop: { direct: false, effectiveDate: null },
  project: { id: "project-1", name: "Project", status: "Active" },
  folderChain: [],
  parentChain: [],
};

const task: TaskView = {
  id: "child-1",
  name: "Child",
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
  project: { id: "project-1", name: "Project" },
  location: { inInbox: false },
  hierarchy: {
    parentId: "parent-1",
    childIds: [],
    hasChildren: false,
    sequential: false,
    completedByChildren: false,
  },
  tags: [],
  repeat: { isRepeating: false, rule: null },
  estimate: { minutes: null },
  timestamps: { created: null, modified: null },
};

describe("Parent create exact verifier", () => {
  it("verifies ordinary parent and containing Project placement", () => {
    const result = verifyParentCreatedTask(expected, { task, tagIds: [] }, parentFacts);
    expect(result.matches).toBe(true);
    expect(result.created?.location).toEqual({
      kind: "parentTask",
      parentTaskId: "parent-1",
      parentTaskName: "Parent",
      projectId: "project-1",
      projectName: "Project",
    });
    expect(result.created).not.toHaveProperty("tagIds");
  });

  it("requires inInbox=false even for a Parent currently in Inbox", () => {
    const inboxFacts = { ...parentFacts, project: null };
    expect(verifyParentCreatedTask(expected, {
      task: { ...task, project: null },
      tagIds: [],
    }, inboxFacts).matches).toBe(true);
    const wrong = verifyParentCreatedTask(expected, {
      task: { ...task, project: null, location: { inInbox: true } },
      tagIds: [],
    }, inboxFacts);
    expect(wrong.matches).toBe(false);
    expect(wrong.diff).toHaveProperty("location.inInbox");
  });

  it.each([
    [{ ...task.hierarchy, parentId: "other" }, task.project, "hierarchy.parentId"],
    [task.hierarchy, { id: "other", name: "Other" }, "project.id"],
  ] as const)("rejects placement mismatch %#", (hierarchy, project, field) => {
    const result = verifyParentCreatedTask(expected, {
      task: { ...task, hierarchy, project },
      tagIds: [],
    }, parentFacts);
    expect(result.matches).toBe(false);
    expect(result.diff).toHaveProperty(field);
  });

  it("does not mistake Project top-level placement for ordinary Parent placement", () => {
    const result = verifyParentCreatedTask(expected, {
      task: { ...task, hierarchy: { ...task.hierarchy, parentId: "project-1" } },
      tagIds: [],
    }, parentFacts);
    expect(result.matches).toBe(false);
    expect(result.diff).toHaveProperty("hierarchy.parentId");
  });

  it("verifies the exact Tag set only for a tagged Parent request", () => {
    const tagged = { ...expected, tagIds: ["tag-a", "tag-b"] };
    expect(verifyParentCreatedTask(tagged, {
      task,
      tagIds: ["tag-b", "tag-a"],
    }, parentFacts).created?.tagIds).toEqual(["tag-a", "tag-b"]);
    expect(verifyParentCreatedTask(tagged, {
      task,
      tagIds: ["tag-a"],
    }, parentFacts).diff).toHaveProperty("tagIds");
  });
});
