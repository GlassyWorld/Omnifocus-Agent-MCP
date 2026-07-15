import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskView } from "../task/taskTypes.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import { CreateTaskLedger, hashIdempotencyKey } from "./createTaskLedger.js";
import { CreateParentTaskService } from "./createParentTaskService.js";
import type { ParentCreateTaskInput } from "./createParentTaskSchemas.js";
import type { ParentTaskFacts, ParentTaskFactsRead } from "./parentDestination.js";
import type { CreateTaskUnderParentResult } from "../../tools/primitives/createTaskUnderParent.js";
import type { CreatedTaskVerificationReadResult } from "../../tools/primitives/readCreatedTaskForVerification.js";

let directory: string;
const now = new Date("2026-07-15T00:00:00.000Z");
const key = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "create-parent-task-service-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

const input: ParentCreateTaskInput = {
  name: "Child",
  destination: { kind: "parentTask", parentTaskId: "parent-1" },
  idempotencyKey: key,
};

const parentFacts: ParentTaskFacts = {
  id: "parent-1",
  name: "Parent",
  kind: "action_group",
  taskStatus: "Available",
  completion: { direct: false, effectiveDate: null },
  drop: { direct: false, effectiveDate: null },
  project: { id: "project-1", name: "Project", status: "Active" },
  folderChain: [{ id: "folder-1", name: "Folder", status: "Active" }],
  parentChain: [{
    id: "project-1",
    kind: "project_root",
    taskStatus: "Available",
    completion: { direct: false, effectiveDate: null },
    drop: { direct: false, effectiveDate: null },
  }],
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

function createHarness(overrides: {
  parentRead?: ParentTaskFactsRead;
  primitive?: CreateTaskUnderParentResult;
  childRead?: CreatedTaskVerificationReadResult;
} = {}) {
  const ledger = new CreateTaskLedger({ stateDirectory: directory, now: () => now });
  const readParentTaskFactsById = vi.fn(async (parentTaskId: string): Promise<ParentTaskFactsRead> => {
    if (overrides.parentRead !== undefined) return overrides.parentRead;
    return {
      success: true,
      facts: parentTaskId === "parent-1"
        ? parentFacts
        : { ...parentFacts, id: parentTaskId, name: "Other Parent", project: null },
    };
  });
  const createTaskUnderParent = vi.fn(async (): Promise<CreateTaskUnderParentResult> => (
    overrides.primitive ?? {
      success: true,
      taskId: "child-1",
      destination: {
        kind: "parentTask",
        parentTaskId: "parent-1",
        projectId: "project-1",
      },
      tagIds: [],
    }
  ));
  const readCreatedTaskForVerification = vi.fn(async (): Promise<CreatedTaskVerificationReadResult> => (
    overrides.childRead ?? { success: true, value: { task, tagIds: [] } }
  ));
  const service = new CreateParentTaskService({
    ledger,
    readParentTaskFactsById,
    createTaskUnderParent,
    readCreatedTaskForVerification,
    now: () => now,
  });
  return {
    service,
    ledger,
    readParentTaskFactsById,
    createTaskUnderParent,
    readCreatedTaskForVerification,
  };
}

describe("CreateParentTaskService hidden P4-B path", () => {
  it("creates once under an exact active action group and verifies current context", async () => {
    const harness = createHarness();
    const result = await harness.service.execute(input, key);
    expect(result.created.location).toEqual({
      kind: "parentTask",
      parentTaskId: "parent-1",
      parentTaskName: "Parent",
      projectId: "project-1",
      projectName: "Project",
    });
    expect(result.idempotency).toEqual({
      key,
      replayed: false,
      replayUntil: "2026-07-16T00:00:00.000Z",
    });
    expect(harness.readParentTaskFactsById).toHaveBeenCalledTimes(2);
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("verified");
  });

  it.each([
    [{ ...parentFacts, kind: "action" }, "parent_not_allowed", "unsupported_parent_kind"],
    [{ ...parentFacts, completion: { direct: true, effectiveDate: null } }, "parent_not_active", "self_completed"],
    [{ ...parentFacts, project: { ...parentFacts.project!, status: "OnHold" as const } }, "parent_not_active", "project_not_active"],
  ] as const)("rejects ineligible Parent before primitive %#", async (facts, code, reason) => {
    const harness = createHarness({ parentRead: { success: true, facts } });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code, reason, mayHaveWritten: false, retrySafe: false },
    });
    expect(harness.createTaskUnderParent).not.toHaveBeenCalled();
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state)
      .toBe("terminal_prewrite_error");
  });

  it("allows same-key retry only for Parent query_failed", async () => {
    const harness = createHarness();
    harness.readParentTaskFactsById
      .mockResolvedValueOnce({ success: false, reason: "query_failed" })
      .mockResolvedValue({ success: true, facts: parentFacts });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: {
        code: "parent_validation_failed",
        reason: "query_failed",
        mayHaveWritten: false,
        retrySafe: true,
      },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state)
      .toBe("retryable_validation_error");
    await expect(harness.service.execute(input, key)).resolves.toMatchObject({ success: true });
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["parent_validation_failed", "query_failed", true],
    ["parent_validation_failed", "schema_drift", false],
    ["tag_not_found", "not_found", true],
    ["tag_not_allowed", "self_on_hold", true],
    ["tag_validation_failed", "lookup_failed", true],
    ["mutually_exclusive_tags", "mutually_exclusive", false],
  ] as const)("maps trusted primitive prewrite %s.%s", async (errorCategory, reason, retrySafe) => {
    const harness = createHarness({
      primitive: { success: false, phase: "prewrite", errorCategory, reason },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: errorCategory, reason, mayHaveWritten: false, retrySafe },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state)
      .toBe(retrySafe ? "retryable_validation_error" : "terminal_prewrite_error");
  });

  it("records unknown primitive outcomes without verification or retry", async () => {
    const harness = createHarness({
      primitive: { success: false, phase: "unknown", errorCategory: "unknown" },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "verification_failed", mayHaveWritten: true, retrySafe: false },
    });
    expect(harness.readCreatedTaskForVerification).not.toHaveBeenCalled();
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("outcome_unknown");
  });

  it("returns partial_success for wrong ordinary Parent placement", async () => {
    const harness = createHarness({
      childRead: {
        success: true,
        value: {
          task: { ...task, hierarchy: { ...task.hierarchy, parentId: "other" } },
          tagIds: [],
        },
      },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "partial_success", taskId: "child-1", mayHaveWritten: true },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state)
      .toBe("verification_failed");
  });

  it("uses the prewrite snapshot only as warned fallback when postwrite facts read fails", async () => {
    const harness = createHarness();
    harness.readParentTaskFactsById
      .mockResolvedValueOnce({ success: true, facts: parentFacts })
      .mockResolvedValueOnce({ success: false, reason: "query_failed" });
    const result = await harness.service.execute(input, key);
    expect(result.success).toBe(true);
    expect(result.warnings.map(item => item.code))
      .toContain("parent_state_unverified_after_creation");
  });

  it("verifies exact Tag IDs for a tagged Parent request", async () => {
    const harness = createHarness();
    harness.createTaskUnderParent.mockResolvedValue({
      success: true,
      taskId: "child-1",
      destination: {
        kind: "parentTask",
        parentTaskId: "parent-1",
        projectId: "project-1",
      },
      tagIds: ["tag-a", "tag-b"],
    });
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: true,
      value: { task, tagIds: ["tag-b", "tag-a"] },
    });
    const result = await harness.service.execute({
      ...input,
      tagIds: ["tag-a", "tag-b"],
    }, key);
    expect(result.created.tagIds).toEqual(["tag-a", "tag-b"]);
  });

  it("returns partial_success when tagged Parent readback has a different Tag set", async () => {
    const harness = createHarness();
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: true,
      value: { task, tagIds: ["tag-a"] },
    });
    await expect(harness.service.execute({
      ...input,
      tagIds: ["tag-a", "tag-b"],
    }, key)).rejects.toMatchObject({
      detail: { code: "partial_success", mayHaveWritten: true },
    });
  });

  it("replays current Parent name without calling the mutation primitive again", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readParentTaskFactsById.mockResolvedValue({
      success: true,
      facts: { ...parentFacts, name: "Renamed Parent" },
    });
    const replay = await harness.service.execute(input, key);
    expect(replay.idempotency.replayed).toBe(true);
    expect(replay.created.location).toMatchObject({
      kind: "parentTask",
      parentTaskName: "Renamed Parent",
    });
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      { ...task, project: null, location: { inInbox: true }, hierarchy: { ...task.hierarchy, parentId: null } },
      { kind: "inbox" },
    ],
    [
      { ...task, hierarchy: { ...task.hierarchy, parentId: "project-1" } },
      { kind: "project", projectId: "project-1" },
    ],
  ] as const)("represents a moved child on replay without rewriting %#", async (currentTask, location) => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: true,
      value: { task: currentTask, tagIds: [] },
    });
    const replay = await harness.service.execute(input, key);
    expect(replay.created.location).toMatchObject(location);
    expect(replay.warnings.map(item => item.code)).toContain("replayed_current_state_changed");
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
  });

  it("represents a current ineligible ordinary Parent during replay", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readParentTaskFactsById.mockResolvedValue({
      success: true,
      facts: {
        ...parentFacts,
        completion: { direct: true, effectiveDate: null },
      },
    });
    const replay = await harness.service.execute(input, key);
    expect(replay.created.location).toMatchObject({ kind: "parentTask", parentTaskId: "parent-1" });
    expect(replay.warnings.map(item => item.code)).toContain("replayed_current_state_changed");
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
  });

  it("fails closed when replay ordinary Parent context is unreadable", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readParentTaskFactsById.mockResolvedValue({ success: false, reason: "schema_drift" });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: {
        code: "replay_target_unavailable",
        reason: "current_parent_context_unavailable",
        mayHaveWritten: true,
        retrySafe: false,
      },
    });
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
  });

  it("recovers verification_failed by readback only and never recreates", async () => {
    const harness = createHarness();
    harness.readCreatedTaskForVerification
      .mockResolvedValueOnce({
        success: true,
        value: {
          task: { ...task, status: { ...task.status, flagged: { ...task.status.flagged, direct: true } } },
          tagIds: [],
        },
      })
      .mockResolvedValue({ success: true, value: { task, tagIds: [] } });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "partial_success" },
    });
    await expect(harness.service.execute(input, key)).resolves.toMatchObject({ success: true });
    expect(harness.createTaskUnderParent).toHaveBeenCalledTimes(1);
  });

  it("keeps Parent fingerprints isolated from an existing tombstone", async () => {
    const harness = createHarness();
    await harness.ledger.withGlobalLock(async () => {
      await harness.ledger.reserve(hashIdempotencyKey(key), "a".repeat(64));
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "idempotency_conflict", mayHaveWritten: false },
    });
    expect(harness.createTaskUnderParent).not.toHaveBeenCalled();
  });
});
