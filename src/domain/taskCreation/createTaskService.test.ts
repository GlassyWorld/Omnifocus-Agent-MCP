import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RawTask } from "../task/taskTypes.js";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import { CreateTaskLedger, hashIdempotencyKey } from "./createTaskLedger.js";
import { CreateTaskService } from "./createTaskService.js";
import type { CreateTaskInput } from "./createTaskSchemas.js";
import type { ProjectDestinationResolution } from "./projectDestination.js";
import type { CreateInboxTaskResult } from "../../tools/primitives/createInboxTask.js";
import type { CreateTaskInProjectResult } from "../../tools/primitives/createTaskInProject.js";

let directory: string;
const now = new Date("2026-07-13T00:00:00.000Z");
const key = "123e4567-e89b-42d3-a456-426614174000";

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
  destination: { kind: "inbox" },
  idempotencyKey: key,
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

function createHarness(overrides: {
  inboxResult?: CreateInboxTaskResult;
  projectResult?: CreateTaskInProjectResult;
  readResult?: { success: boolean; tasks?: RawTask[]; error?: string };
  resolution?: ProjectDestinationResolution;
} = {}) {
  const ledger = new CreateTaskLedger({ stateDirectory: directory, now: () => now });
  const createInboxTask = vi.fn().mockResolvedValue(
    overrides.inboxResult ?? { success: true, taskId: "task-1" },
  );
  const createTaskInProject = vi.fn().mockResolvedValue(
    overrides.projectResult ?? { success: true, taskId: "task-1", projectId: "project-1" },
  );
  const resolveProjectById = vi.fn().mockResolvedValue(overrides.resolution ?? activeProject);
  const readTaskById = vi.fn().mockResolvedValue(
    overrides.readResult ?? { success: true, tasks: [rawTask] },
  );
  const service = new CreateTaskService({
    ledger,
    createInboxTask,
    createTaskInProject,
    resolveProjectById,
    readTaskById,
    now: () => now,
  });
  return { service, ledger, createInboxTask, createTaskInProject, resolveProjectById, readTaskById };
}

describe("CreateTaskService", () => {
  it("creates and verifies an explicit Inbox destination", async () => {
    const harness = createHarness();
    const result = await harness.service.execute(input, key);
    expect(result.created.location).toEqual({ kind: "inbox" });
    expect(result.idempotency).toEqual({
      key,
      replayed: false,
      replayUntil: "2026-07-14T00:00:00.000Z",
    });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
    expect(harness.createTaskInProject).not.toHaveBeenCalled();
    expect(harness.resolveProjectById).not.toHaveBeenCalled();
  });

  it("validates, dispatches, and verifies one exact Project destination without fallback", async () => {
    const harness = createHarness({
      readResult: {
        success: true,
        tasks: [{ ...rawTask, inInbox: false, projectId: "project-1", projectName: "Project" }],
      },
    });
    const projectInput: CreateTaskInput = {
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    };
    const result = await harness.service.execute(projectInput, key);
    expect(result.created.location).toEqual({
      kind: "project",
      projectId: "project-1",
      projectName: "Project",
    });
    expect(harness.resolveProjectById).toHaveBeenCalledTimes(2);
    expect(harness.createTaskInProject).toHaveBeenCalledTimes(1);
    expect(harness.createInboxTask).not.toHaveBeenCalled();
  });

  it("replays current state without creating again", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readTaskById.mockResolvedValue({
      success: true,
      tasks: [{ ...rawTask, name: "User edited name" }],
    });
    const replay = await harness.service.execute(input, key);
    expect(replay.idempotency.replayed).toBe(true);
    expect(replay.created.name).toBe("User edited name");
    expect(replay.warnings.map(item => item.code)).toContain("replayed_current_state_changed");
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("rejects the same key with a different destination fingerprint", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    await expect(harness.service.execute({
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    }, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "idempotency_conflict", retrySafe: false },
    });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("permanently consumes a key for a deterministic missing Project", async () => {
    const harness = createHarness({ resolution: { success: false, reason: "not_found" } });
    const projectInput: CreateTaskInput = {
      ...input,
      destination: { kind: "project", projectId: "missing" },
    };
    await expect(harness.service.execute(projectInput, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "project_not_found", reason: "not_found", mayHaveWritten: false, retrySafe: false },
    });
    await expect(harness.service.execute(projectInput, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "duplicate_request", reason: "prior_prewrite_attempt" },
    });
    expect(harness.createTaskInProject).not.toHaveBeenCalled();
  });

  it("allows same-key retry after a transient prewrite validation failure", async () => {
    const harness = createHarness({ resolution: { success: false, reason: "query_failed" } });
    const projectInput: CreateTaskInput = {
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    };
    await expect(harness.service.execute(projectInput, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: {
        code: "project_validation_failed",
        reason: "query_failed",
        mayHaveWritten: false,
        retrySafe: true,
      },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("retryable_validation_error");

    harness.resolveProjectById.mockResolvedValue(activeProject);
    harness.readTaskById.mockResolvedValue({
      success: true,
      tasks: [{ ...rawTask, inInbox: false, projectId: "project-1", projectName: "Project" }],
    });
    const result = await harness.service.execute(projectInput, key);
    expect(result.success).toBe(true);
    expect(harness.createTaskInProject).toHaveBeenCalledTimes(1);
  });

  it("allows same-key retry after a trusted JXA validation prewrite failure", async () => {
    const harness = createHarness({
      readResult: {
        success: true,
        tasks: [{ ...rawTask, inInbox: false, projectId: "project-1", projectName: "Project" }],
      },
    });
    harness.createTaskInProject
      .mockResolvedValueOnce({
        success: false,
        phase: "prewrite",
        errorCategory: "project_validation_failed",
        reason: "ancestor_state_unknown",
      })
      .mockResolvedValueOnce({ success: true, taskId: "task-1", projectId: "project-1" });
    const projectInput: CreateTaskInput = {
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    };
    await expect(harness.service.execute(projectInput, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: {
        code: "project_validation_failed",
        reason: "ancestor_state_unknown",
        mayHaveWritten: false,
        retrySafe: true,
      },
    });
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("retryable_validation_error");
    await expect(harness.service.execute(projectInput, key)).resolves.toMatchObject({ success: true });
    expect(harness.createTaskInProject).toHaveBeenCalledTimes(2);
    expect(harness.createInboxTask).not.toHaveBeenCalled();
  });

  it("records a definitive Inbox prewrite failure", async () => {
    const harness = createHarness({
      inboxResult: { success: false, phase: "prewrite", errorCategory: "prewrite_failure" },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "write_failed", mayHaveWritten: false },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "duplicate_request", reason: "prior_prewrite_attempt" },
    });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });

  it("fails closed for an unknown outcome", async () => {
    const harness = createHarness({
      inboxResult: { success: false, phase: "unknown", errorCategory: "unknown" },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "verification_failed", mayHaveWritten: true, retrySafe: false },
    });
    expect(harness.readTaskById).not.toHaveBeenCalled();
    expect((await harness.ledger.read(hashIdempotencyKey(key)))?.state).toBe("outcome_unknown");
  });

  it("returns partial_success only for a placement or field mismatch", async () => {
    const harness = createHarness({
      readResult: { success: true, tasks: [{ ...rawTask, flagged: true, effectiveFlagged: true }] },
    });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "partial_success", taskId: "task-1", mayHaveWritten: true },
    });
  });

  it("returns success with a warning if Project state changes after exact placement", async () => {
    const harness = createHarness({
      readResult: {
        success: true,
        tasks: [{ ...rawTask, inInbox: false, projectId: "project-1", projectName: "Project" }],
      },
    });
    harness.resolveProjectById
      .mockResolvedValueOnce(activeProject)
      .mockResolvedValueOnce({
        success: true,
        project: { ...activeProject.project, rawStatus: "OnHold" },
      });
    const result = await harness.service.execute({
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    }, key);
    expect(result.success).toBe(true);
    expect(result.warnings.map(item => item.code)).toContain("project_state_changed_after_creation");
  });

  it("returns success with an unverified warning if the post-write Project read fails", async () => {
    const harness = createHarness({
      readResult: {
        success: true,
        tasks: [{ ...rawTask, inInbox: false, projectId: "project-1", projectName: "Project" }],
      },
    });
    harness.resolveProjectById
      .mockResolvedValueOnce(activeProject)
      .mockRejectedValueOnce(new Error("temporary"));
    const result = await harness.service.execute({
      ...input,
      destination: { kind: "project", projectId: "project-1" },
    }, key);
    expect(result.success).toBe(true);
    expect(result.warnings.map(item => item.code)).toContain("project_state_unverified_after_creation");
  });

  it("does not recreate when a replay target is unavailable", async () => {
    const harness = createHarness();
    await harness.service.execute(input, key);
    harness.readTaskById.mockResolvedValue({ success: true, tasks: [] });
    await expect(harness.service.execute(input, key)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "replay_target_unavailable", mayHaveWritten: true },
    });
    expect(harness.createInboxTask).toHaveBeenCalledTimes(1);
  });
});
