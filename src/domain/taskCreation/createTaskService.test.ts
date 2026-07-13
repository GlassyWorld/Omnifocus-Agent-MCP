import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RawTask } from "../task/taskTypes.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import { CreateTaskLedger } from "./createTaskLedger.js";
import { CreateTaskService } from "./createTaskService.js";
import { CreateTaskInput } from "./createTaskSchemas.js";
import { CreateInboxTaskResult } from "../../tools/primitives/createInboxTask.js";

let directory: string;
const now = new Date("2026-07-13T00:00:00.000Z");

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "create-task-service-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

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
  tagNames: [],
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

const input: CreateTaskInput = {
  name: "Task",
  idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
};

function createHarness(overrides: {
  createResult?: CreateInboxTaskResult;
  readResult?: { success: boolean; tasks?: RawTask[]; error?: string };
} = {}) {
  const createInboxTask = vi.fn().mockResolvedValue(
    overrides.createResult ?? { success: true, taskId: "task-1" },
  );
  const readTaskById = vi.fn().mockResolvedValue(
    overrides.readResult ?? { success: true, tasks: [rawTask] },
  );
  const service = new CreateTaskService({
    ledger: new CreateTaskLedger({ stateDirectory: directory, now: () => now }),
    createInboxTask,
    readTaskById,
    now: () => now,
  });
  return { service, createInboxTask, readTaskById };
}

describe("CreateTaskService", () => {
  it("creates, verifies, and returns compact success", async () => {
    const harness = createHarness();
    const result = await harness.service.execute(input, input.idempotencyKey!);
    expect(result).toEqual({
      success: true,
      created: {
        id: "task-1",
        name: "Task",
        note: "",
        location: { kind: "inbox" },
        plannedDate: null,
        dueDate: null,
        deferDate: null,
        flagged: false,
        estimatedMinutes: null,
      },
      idempotency: {
        key: input.idempotencyKey,
        replayed: false,
        replayUntil: "2026-07-14T00:00:00.000Z",
      },
      warnings: [],
    });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
    expect(harness.readTaskById).toHaveBeenCalledWith("task-1");
  });

  it("replays current state without creating again", async () => {
    const harness = createHarness();
    await harness.service.execute(input, input.idempotencyKey!);
    harness.readTaskById.mockResolvedValue({
      success: true,
      tasks: [{ ...rawTask, name: "User edited name" }],
    });
    const replay = await harness.service.execute(input, input.idempotencyKey!);
    expect(replay.idempotency.replayed).toBe(true);
    expect(replay.created.name).toBe("User edited name");
    expect(replay.warnings.map(item => item.code)).toContain("replayed_current_state_changed");
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("rejects the same key with a different canonical payload", async () => {
    const harness = createHarness();
    await harness.service.execute(input, input.idempotencyKey!);
    await expect(harness.service.execute({ ...input, name: "Different" }, input.idempotencyKey!))
      .rejects.toMatchObject<CreateTaskOperationError>({
        detail: { code: "idempotency_conflict", retrySafe: false },
      });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("records a definitive prewrite failure", async () => {
    const harness = createHarness({
      createResult: { success: false, phase: "prewrite", errorCategory: "prewrite_failure" },
    });
    await expect(harness.service.execute(input, input.idempotencyKey!))
      .rejects.toMatchObject<CreateTaskOperationError>({
        detail: { code: "write_failed", mayHaveWritten: false },
      });
    await expect(harness.service.execute(input, input.idempotencyKey!))
      .rejects.toMatchObject<CreateTaskOperationError>({
        detail: { code: "duplicate_request", reason: "prior_prewrite_attempt" },
      });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("fails closed for an unknown outcome", async () => {
    const harness = createHarness({
      createResult: { success: false, phase: "unknown", errorCategory: "unknown" },
    });
    await expect(harness.service.execute(input, input.idempotencyKey!))
      .rejects.toMatchObject<CreateTaskOperationError>({
        detail: { code: "verification_failed", mayHaveWritten: true, retrySafe: false },
      });
    expect(harness.readTaskById).not.toHaveBeenCalled();
  });

  it("returns partial_success for a verified mismatch", async () => {
    const harness = createHarness({
      readResult: { success: true, tasks: [{ ...rawTask, flagged: true, effectiveFlagged: true }] },
    });
    await expect(harness.service.execute(input, input.idempotencyKey!))
      .rejects.toMatchObject<CreateTaskOperationError>({
        detail: { code: "partial_success", taskId: "task-1", mayHaveWritten: true },
      });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("does not recreate when a replay target is unavailable", async () => {
    const harness = createHarness();
    await harness.service.execute(input, input.idempotencyKey!);
    harness.readTaskById.mockResolvedValue({ success: true, tasks: [] });
    await expect(harness.service.execute(input, input.idempotencyKey!))
      .rejects.toMatchObject<CreateTaskOperationError>({
        detail: { code: "replay_target_unavailable", mayHaveWritten: true },
      });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });
});
