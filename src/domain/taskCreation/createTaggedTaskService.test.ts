import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TaskView } from "../task/taskTypes.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import { CreateTaskLedger, hashIdempotencyKey } from "./createTaskLedger.js";
import { CreateTaggedTaskService } from "./createTaggedTaskService.js";
import type { TaggedCreateTaskInput } from "./createTaskTagSchemas.js";
import type { ProjectDestinationResolution } from "./projectDestination.js";

let directory: string;
const now = new Date("2026-07-14T00:00:00.000Z");
const key = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tagged-create-service-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

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
  tags: ["Synthetic"],
  repeat: { isRepeating: false, rule: null },
  estimate: { minutes: null },
  timestamps: { created: null, modified: null },
};

const input: TaggedCreateTaskInput = {
  name: "Task",
  destination: { kind: "inbox" },
  idempotencyKey: key,
  tagIds: ["tag-b", "tag-a"],
};

const activeProject: ProjectDestinationResolution = {
  success: true,
  project: {
    id: "project-1",
    name: "Project",
    kind: "standard",
    rawStatus: "Active",
    ancestorFolderDropped: false,
  },
};

function createHarness() {
  const ledger = new CreateTaskLedger({ stateDirectory: directory, now: () => now });
  const createTaggedTask = vi.fn().mockResolvedValue({
    success: true,
    taskId: "task-1",
    destination: { kind: "inbox" },
    tagIds: ["tag-a", "tag-b"],
  });
  const resolveProjectById = vi.fn().mockResolvedValue(activeProject);
  const readCreatedTaskForVerification = vi.fn().mockResolvedValue({
    success: true,
    value: { task, tagIds: ["tag-a", "tag-b"] },
  });
  const service = new CreateTaggedTaskService({
    ledger,
    createTaggedTask,
    resolveProjectById,
    readCreatedTaskForVerification,
    now: () => now,
  });
  return {
    service,
    ledger,
    createTaggedTask,
    resolveProjectById,
    readCreatedTaskForVerification,
  };
}

describe("hidden CreateTaggedTaskService", () => {
  it("canonicalizes Tag set order, writes once, and returns actual readback IDs", async () => {
    const harness = createHarness();
    const result = await harness.service.execute(input, key);
    expect(result.created.tagIds).toEqual(["tag-a", "tag-b"]);
    expect(result.idempotency).toEqual({
      key,
      replayed: false,
      replayUntil: "2026-07-15T00:00:00.000Z",
    });
    expect(harness.createTaggedTask).toHaveBeenCalledWith(expect.objectContaining({
      tagIds: ["tag-a", "tag-b"],
    }));
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("verified");
  });

  it("preserves exact Project validation and top-level readback semantics", async () => {
    const harness = createHarness();
    harness.createTaggedTask.mockResolvedValue({
      success: true,
      taskId: "task-1",
      destination: { kind: "project", projectId: "project-1" },
      tagIds: ["tag-a", "tag-b"],
    });
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: true,
      value: {
        task: {
          ...task,
          location: { inInbox: false },
          project: { id: "project-1", name: "Project" },
          hierarchy: { ...task.hierarchy, parentId: "project-1" },
        },
        tagIds: ["tag-a", "tag-b"],
      },
    });
    const result = await harness.service.execute({
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    }, key);
    expect(result.created.location).toEqual({
      kind: "project",
      projectId: "project-1",
      projectName: "Project",
    });
    expect(harness.resolveProjectById).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["tag_not_found", "not_found", "retryable_validation_error", true],
    ["tag_not_allowed", "ancestor_on_hold", "retryable_validation_error", true],
    ["tag_validation_failed", "parent_cycle", "retryable_validation_error", true],
    ["mutually_exclusive_tags", "mutually_exclusive", "terminal_prewrite_error", false],
  ] as const)("maps %s to the accepted Ledger/error semantics", async (
    code,
    reason,
    state,
    retrySafe,
  ) => {
    const harness = createHarness();
    harness.createTaggedTask.mockResolvedValue({
      success: false,
      phase: "prewrite",
      errorCategory: code,
      reason,
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code, reason, mayHaveWritten: false, retrySafe },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe(state);
  });

  it("allows same-key retry only after a retryable prewrite Tag failure", async () => {
    const harness = createHarness();
    harness.createTaggedTask
      .mockResolvedValueOnce({
        success: false,
        phase: "prewrite",
        errorCategory: "tag_not_found",
        reason: "not_found",
      })
      .mockResolvedValueOnce({
        success: true,
        taskId: "task-1",
        destination: { kind: "inbox" },
        tagIds: ["tag-a", "tag-b"],
      });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "tag_not_found", retrySafe: true },
    });
    await expect(harness.service.execute(input, key)).resolves.toMatchObject({ success: true });
    expect(harness.createTaggedTask).toHaveBeenCalledTimes(2);
  });

  it("returns partial_success for valid but mismatched actual 0/6+ Tag sets", async () => {
    for (const actualTagIds of [
      [],
      ["a", "b", "c", "d", "e", "f"],
    ]) {
      const harness = createHarness();
      harness.readCreatedTaskForVerification.mockResolvedValue({
        success: true,
        value: { task, tagIds: actualTagIds },
      });
      await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
        detail: {
          code: "partial_success",
          mayHaveWritten: true,
          retrySafe: false,
          verificationDiff: { tagIds: expect.any(Object) },
        },
      });
      await rm(directory, { recursive: true, force: true });
      directory = await mkdtemp(join(tmpdir(), "tagged-create-service-test-"));
    }
  });

  it("uses verification_failed when the actual Tag collection is untrustworthy", async () => {
    const harness = createHarness();
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: false,
      reason: "tag_schema_drift",
      taskExists: true,
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: {
        code: "verification_failed",
        reason: "tag_schema_drift",
        mayHaveWritten: true,
      },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("verification_failed");
  });

  it("never writes again after unknown outcome", async () => {
    const harness = createHarness();
    harness.createTaggedTask.mockResolvedValue({
      success: false,
      phase: "unknown",
      errorCategory: "unknown",
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "verification_failed", mayHaveWritten: true },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "duplicate_request", reason: "outcome_unknown" },
    });
    expect(harness.createTaggedTask).toHaveBeenCalledTimes(1);
  });

  it("does not expose primitive exception messages through the public error", async () => {
    const harness = createHarness();
    harness.createTaggedTask.mockRejectedValue(
      new Error("PRIVATE_PROCESS_OUTPUT tag-name=/Secret/Client"),
    );
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: {
        code: "verification_failed",
        message: "The tagged create operation ended with an unknown outcome.",
        reason: "outcome_unknown",
        mayHaveWritten: true,
      },
    });
  });

  it("replays current 1-5 Tag state without writing and warns on change", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: true,
      value: { task: { ...task, name: "Changed" }, tagIds: ["current"] },
    });
    const replay = await harness.service.execute(input, key);
    expect(replay.idempotency.replayed).toBe(true);
    expect(replay.created.tagIds).toEqual(["current"]);
    expect(replay.warnings.map(item => item.code)).toContain("replayed_current_state_changed");
    expect(harness.createTaggedTask).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[]],
    [["a", "b", "c", "d", "e", "f"]],
  ] as const)("fails closed for tagged replay current state %#", async tagIds => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readCreatedTaskForVerification.mockResolvedValue({
      success: true,
      value: { task, tagIds },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: {
        code: "replay_target_unavailable",
        reason: "current_tag_state_out_of_contract",
        mayHaveWritten: true,
        retrySafe: false,
      },
    });
    expect(harness.createTaggedTask).toHaveBeenCalledTimes(1);
  });

  it("allows verification_failed to become verified after a manual Tag correction without rewriting", async () => {
    const harness = createHarness();
    harness.readCreatedTaskForVerification
      .mockResolvedValueOnce({
        success: true,
        value: { task, tagIds: ["tag-a"] },
      })
      .mockResolvedValueOnce({
        success: true,
        value: { task, tagIds: ["tag-a", "tag-b"] },
      });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject({
      detail: { code: "partial_success" },
    });
    await expect(harness.service.execute(input, key)).resolves.toMatchObject({ success: true });
    expect(harness.createTaggedTask).toHaveBeenCalledTimes(1);
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("verified");
  });

  it("keeps tagged payloads domain-separated from existing no-tag V2 tombstones", async () => {
    const harness = createHarness();
    const keyHash = hashIdempotencyKey(key);
    await harness.ledger.withGlobalLock(async () => {
      await harness.ledger.reserve(keyHash, "a".repeat(64));
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "idempotency_conflict", mayHaveWritten: false },
    });
    expect(harness.createTaggedTask).not.toHaveBeenCalled();
  });
});
