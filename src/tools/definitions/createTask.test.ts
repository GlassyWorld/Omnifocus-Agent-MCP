import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CreateTaskOperationError } from "../../domain/taskCreation/createTaskErrors.js";
import {
  type CreateTaskCanaryAuditRecord,
  type CreateTaskHandlerService,
  handler,
  inputSchema,
  schema,
  _testExports,
} from "./createTask.js";

const key = "123e4567-e89b-42d3-a456-426614174000";
const inboxInput = { name: "Task", destination: { kind: "inbox" as const }, idempotencyKey: key };
const enabledEnv = { OMNIFOCUS_CREATE_TASK_ENABLED: "true" };
const projectEnabledEnv = {
  ...enabledEnv,
  OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED: "true",
};
const taggedEnabledEnv = {
  ...enabledEnv,
  OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: "true",
};
const taggedProjectEnabledEnv = {
  ...projectEnabledEnv,
  OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: "true",
};
const parentEnabledEnv = {
  ...enabledEnv,
  OMNIFOCUS_CREATE_TASK_PARENT_ENABLED: "true",
};
const taggedParentEnabledEnv = {
  ...parentEnabledEnv,
  OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: "true",
};
const parentInput = {
  name: "Task",
  destination: { kind: "parentTask" as const, parentTaskId: "parent-1" },
  idempotencyKey: key,
};
const success = {
  success: true as const,
  created: {
    id: "task-1",
    name: "Task",
    note: "",
    location: { kind: "inbox" as const },
    plannedDate: null,
    dueDate: null,
    deferDate: null,
    flagged: false,
    estimatedMinutes: null,
  },
  idempotency: { key, replayed: false, replayUntil: "2026-07-14T00:00:00.000Z" },
  warnings: [],
};
const taggedSuccess = {
  ...success,
  created: { ...success.created, tagIds: ["tag-a"] },
};
const parentSuccess = {
  ...success,
  created: {
    ...success.created,
    location: {
      kind: "parentTask" as const,
      parentTaskId: "parent-1",
      parentTaskName: "Parent",
      projectId: "project-1",
      projectName: "Project",
    },
  },
};
const taggedParentSuccess = {
  ...parentSuccess,
  created: { ...parentSuccess.created, tagIds: ["tag-a"] },
};

function extra(requestId: string | number = 1) {
  return { requestId } as Parameters<typeof handler>[1];
}

describe("create_task handler", () => {
  it("publishes a strict V4 schema with three destinations and optional bounded tagIds", () => {
    expect(Object.keys(schema.shape).sort()).toEqual([
      "deferDate",
      "destination",
      "dueDate",
      "estimatedMinutes",
      "flagged",
      "idempotencyKey",
      "name",
      "note",
      "plannedDate",
      "tagIds",
    ]);
    expect(schema.safeParse(inboxInput).success).toBe(true);
    expect(schema.safeParse({ name: "Task", idempotencyKey: key }).success).toBe(false);
    expect(schema.safeParse({
      name: "Task",
      destination: { kind: "project", projectId: "project-1" },
      idempotencyKey: key,
    }).success).toBe(true);
    expect(schema.safeParse({ ...inboxInput, tagIds: ["tag-a"] }).success).toBe(true);
    expect(schema.safeParse({ ...inboxInput, tagIds: [] }).success).toBe(false);
    expect(schema.safeParse({
      ...inboxInput,
      tagIds: ["1", "2", "3", "4", "5", "6"],
    }).success).toBe(false);
    expect(inputSchema.safeParse({ name: "Task", destination: { kind: "inbox" } }).success).toBe(false);
    expect(schema.safeParse({
      ...parentInput,
      destination: { ...parentInput.destination, projectId: "project-1" },
    }).success).toBe(false);
    expect(schema.safeParse(parentInput).success).toBe(true);
  });

  it("publishes Parent fail-closed before service with a reason-qualified audit", async () => {
    const factsReader = vi.fn();
    const ledger = vi.fn();
    const lock = vi.fn();
    const executor = vi.fn();
    const readback = vi.fn();
    const service: CreateTaskHandlerService = {
      execute: vi.fn(async () => {
        factsReader();
        ledger();
        lock();
        executor();
        readback();
        return parentSuccess;
      }),
    };
    const records: CreateTaskCanaryAuditRecord[] = [];
    const result = await handler(
      parentInput,
      extra("private-request"),
      service,
      enabledEnv,
      record => records.push(record),
    );
    expect(JSON.parse(result.content[0].text).error).toMatchObject({
      code: "write_disabled",
      reason: "parent_placement_disabled",
      mayHaveWritten: false,
      retrySafe: false,
    });
    expect(service.execute).not.toHaveBeenCalled();
    expect(factsReader).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    expect(readback).not.toHaveBeenCalled();
    expect(records[0].resultCode).toBe("write_disabled.parent_placement_disabled");
    expect(JSON.stringify(records)).not.toContain("parent-1");
    expect(JSON.stringify(records)).not.toContain("private-request");
  });

  it("runs the strict object parser and rejects extra fields before service", async () => {
    const service = { execute: vi.fn() };
    const result = await handler({ ...inboxInput, tags: [] } as any, extra(), service);
    expect(JSON.parse(result.content[0].text).error.code).toBe("invalid_arguments");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("returns identical structured and JSON success for Inbox V2", async () => {
    const service: CreateTaskHandlerService = { execute: vi.fn().mockResolvedValue(success) };
    const result = await handler(inboxInput, extra(), service, enabledEnv, vi.fn());
    expect(result).not.toHaveProperty("isError");
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(service.execute).toHaveBeenCalledWith(inboxInput, key);
  });

  it("rejects duplicate tagged intent before gates or service", async () => {
    const service = { execute: vi.fn() };
    const result = await handler(
      { ...inboxInput, tagIds: ["tag-a", "tag-a"] },
      extra(),
      service,
      taggedEnabledEnv,
      vi.fn(),
    );
    expect(JSON.parse(result.content[0].text).error.code).toBe("invalid_arguments");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("keeps every tagged dependency unreachable when the Tag flag is false", async () => {
    const resolver = vi.fn();
    const ledger = vi.fn();
    const lock = vi.fn();
    const executor = vi.fn();
    const readback = vi.fn();
    const service: CreateTaskHandlerService = {
      execute: vi.fn(async () => {
        resolver();
        ledger();
        lock();
        executor();
        readback();
        return taggedSuccess;
      }),
    };
    const records: CreateTaskCanaryAuditRecord[] = [];
    const result = await handler(
      { ...inboxInput, tagIds: ["private-tag-id"] },
      extra("private-request"),
      service,
      enabledEnv,
      record => records.push(record),
    );

    expect(JSON.parse(result.content[0].text).error).toMatchObject({
      code: "write_disabled",
      reason: "tag_assignment_disabled",
      mayHaveWritten: false,
      retrySafe: false,
    });
    expect(service.execute).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    expect(readback).not.toHaveBeenCalled();
    expect(records[0].resultCode).toBe("write_disabled.tag_assignment_disabled");
    expect(JSON.stringify(records)).not.toContain("private-tag-id");
    expect(JSON.stringify(records)).not.toContain("private-request");
  });

  it("preserves global then Project then Tag gate order", async () => {
    const taggedProjectInput = {
      name: "Task",
      destination: { kind: "project" as const, projectId: "project-1" },
      idempotencyKey: key,
      tagIds: ["tag-a"],
    };
    const service = { execute: vi.fn() };

    const global = await handler(taggedProjectInput, extra(), service, {}, vi.fn());
    expect(JSON.parse(global.content[0].text).error).not.toHaveProperty("reason");

    const project = await handler(taggedProjectInput, extra(), service, enabledEnv, vi.fn());
    expect(JSON.parse(project.content[0].text).error.reason).toBe("project_placement_disabled");

    const tag = await handler(taggedProjectInput, extra(), service, projectEnabledEnv, vi.fn());
    expect(JSON.parse(tag.content[0].text).error.reason).toBe("tag_assignment_disabled");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("preserves global then Parent then Tag gate order", async () => {
    const taggedParentInput = { ...parentInput, tagIds: ["tag-a"] };
    const service = { execute: vi.fn() };

    const global = await handler(taggedParentInput, extra(), service, {}, vi.fn());
    expect(JSON.parse(global.content[0].text).error).not.toHaveProperty("reason");

    const parent = await handler(taggedParentInput, extra(), service, enabledEnv, vi.fn());
    expect(JSON.parse(parent.content[0].text).error.reason).toBe("parent_placement_disabled");

    const tag = await handler(taggedParentInput, extra(), service, parentEnabledEnv, vi.fn());
    expect(JSON.parse(tag.content[0].text).error.reason).toBe("tag_assignment_disabled");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("dispatches Parent without requiring the Project flag", async () => {
    const service: CreateTaskHandlerService = {
      execute: vi.fn().mockResolvedValue(parentSuccess),
    };
    const result = await handler(parentInput, extra(), service, parentEnabledEnv, vi.fn());
    expect(result.structuredContent?.created.location).toMatchObject({
      kind: "parentTask",
      parentTaskId: "parent-1",
    });
    expect(service.execute).toHaveBeenCalledWith(parentInput, key);
  });

  it("dispatches tagged Parent only when Parent and Tag flags are true", async () => {
    const taggedInput = { ...parentInput, tagIds: ["tag-a"] };
    const service: CreateTaskHandlerService = {
      execute: vi.fn().mockResolvedValue(taggedParentSuccess),
    };
    const result = await handler(
      taggedInput,
      extra(),
      service,
      taggedParentEnabledEnv,
      vi.fn(),
    );
    expect(result.structuredContent?.created.tagIds).toEqual(["tag-a"]);
    expect(service.execute).toHaveBeenCalledWith(taggedInput, key);
  });

  it("dispatches tagged Inbox/Project only when all applicable flags are exactly true", async () => {
    const service: CreateTaskHandlerService = {
      execute: vi.fn().mockResolvedValue(taggedSuccess),
    };
    const inboxResult = await handler(
      { ...inboxInput, tagIds: ["tag-a"] },
      extra(),
      service,
      taggedEnabledEnv,
      vi.fn(),
    );
    expect(JSON.parse(inboxResult.content[0].text)).toEqual(inboxResult.structuredContent);
    expect(inboxResult.structuredContent?.created.tagIds).toEqual(["tag-a"]);

    const projectSuccess = {
      ...taggedSuccess,
      created: {
        ...taggedSuccess.created,
        location: {
          kind: "project" as const,
          projectId: "project-1",
          projectName: "Project",
        },
      },
    };
    service.execute = vi.fn().mockResolvedValue(projectSuccess);
    const projectResult = await handler({
      name: "Task",
      destination: { kind: "project", projectId: "project-1" },
      idempotencyKey: key,
      tagIds: ["tag-a"],
    }, extra(), service, taggedProjectEnabledEnv, vi.fn());
    expect(projectResult.structuredContent?.created.tagIds).toEqual(["tag-a"]);
  });

  it("uses branch-specific success parsers", async () => {
    const noTagWithIds = {
      ...success,
      created: { ...success.created, tagIds: ["unexpected"] },
    };
    const noTagResult = await handler(
      inboxInput,
      extra(),
      { execute: vi.fn().mockResolvedValue(noTagWithIds) },
      enabledEnv,
      vi.fn(),
    );
    expect(JSON.parse(noTagResult.content[0].text).error.code).toBe("internal_error");

    const taggedWithoutIds = await handler(
      { ...inboxInput, tagIds: ["tag-a"] },
      extra(),
      { execute: vi.fn().mockResolvedValue(success) },
      taggedEnabledEnv,
      vi.fn(),
    );
    expect(JSON.parse(taggedWithoutIds.content[0].text).error.code).toBe("internal_error");

    const parentNoTagWithIds = await handler(
      parentInput,
      extra(),
      { execute: vi.fn().mockResolvedValue(taggedParentSuccess) },
      parentEnabledEnv,
      vi.fn(),
    );
    expect(JSON.parse(parentNoTagWithIds.content[0].text).error.code).toBe("internal_error");

    const taggedParentWithoutIds = await handler(
      { ...parentInput, tagIds: ["tag-a"] },
      extra(),
      { execute: vi.fn().mockResolvedValue(parentSuccess) },
      taggedParentEnabledEnv,
      vi.fn(),
    );
    expect(JSON.parse(taggedParentWithoutIds.content[0].text).error.code).toBe("internal_error");
  });

  it("keeps Project resolver, Ledger, lock, and executor unreachable when its flag is false", async () => {
    const resolver = vi.fn();
    const ledger = vi.fn();
    const lock = vi.fn();
    const executor = vi.fn();
    const service: CreateTaskHandlerService = {
      execute: vi.fn(async () => {
        resolver();
        ledger();
        lock();
        executor();
        return success;
      }),
    };
    const records: CreateTaskCanaryAuditRecord[] = [];
    const result = await handler({
      name: "Task",
      destination: { kind: "project", projectId: "project-1" },
      idempotencyKey: key,
    }, extra(), service, enabledEnv, record => records.push(record));

    expect(JSON.parse(result.content[0].text).error).toMatchObject({
      code: "write_disabled",
      reason: "project_placement_disabled",
      mayHaveWritten: false,
    });
    expect(service.execute).not.toHaveBeenCalled();
    expect(resolver).not.toHaveBeenCalled();
    expect(ledger).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    expect(records[0].resultCode).toBe("write_disabled");
  });

  it("allows Inbox V2 while the Project-specific flag remains false", async () => {
    const service: CreateTaskHandlerService = { execute: vi.fn().mockResolvedValue(success) };
    const result = await handler(inboxInput, extra(), service, enabledEnv, vi.fn());
    expect(result).not.toHaveProperty("isError");
    expect(service.execute).toHaveBeenCalledTimes(1);
  });

  it("allows Project dispatch only when both flags are exactly true", async () => {
    const service: CreateTaskHandlerService = { execute: vi.fn().mockResolvedValue(success) };
    await handler({
      name: "Task",
      destination: { kind: "project", projectId: "project-1" },
      idempotencyKey: key,
    }, extra(), service, projectEnabledEnv, vi.fn());
    expect(service.execute).toHaveBeenCalledTimes(1);
  });

  it("returns stable errors and emits a reason-qualified privacy-safe result code", async () => {
    const records: CreateTaskCanaryAuditRecord[] = [];
    const service: CreateTaskHandlerService = {
      execute: vi.fn().mockRejectedValue(new CreateTaskOperationError({
        code: "project_validation_failed",
        message: "Temporary read failure.",
        mayHaveWritten: false,
        retrySafe: true,
        reason: "query_failed",
      })),
    };
    const result = await handler({
      name: "Task",
      destination: { kind: "project", projectId: "project-1" },
      idempotencyKey: key,
    }, extra(), service, projectEnabledEnv, record => records.push(record));
    expect(JSON.parse(result.content[0].text).error).toMatchObject({
      code: "project_validation_failed",
      reason: "query_failed",
      retrySafe: true,
    });
    expect(records[0].resultCode).toBe("project_validation_failed.query_failed");
  });

  it("uses request metadata only behind the explicit stability gate", () => {
    expect(_testExports.resolveEffectiveKey(undefined, extra("request-1"), {})).toBeNull();
    expect(_testExports.resolveEffectiveKey(undefined, extra("request-1"), {
      OMNIFOCUS_MCP_STABLE_REQUEST_ID: "true",
    })).toBe("mcp:request-1");
    expect(_testExports.resolveEffectiveKey(key, extra("request-1"), {})).toBe(key);
  });

  it("logs only the six privacy-safe Canary audit fields", async () => {
    const records: CreateTaskCanaryAuditRecord[] = [];
    const service: CreateTaskHandlerService = { execute: vi.fn().mockResolvedValue(success) };
    await handler(
      { ...inboxInput, name: "private task", note: "private note" },
      extra("request-private"),
      service,
      enabledEnv,
      record => records.push(record),
    );
    expect(Object.keys(records[0]).sort()).toEqual([
      "argsIdempotencyKeyHash",
      "correlationId",
      "effectiveKeyHash",
      "elapsedMs",
      "requestMetadataHash",
      "resultCode",
    ]);
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("private task");
    expect(serialized).not.toContain("private note");
    expect(serialized).not.toContain("request-private");
    expect(serialized).not.toContain(key);
  });

  it("persists only the audit allowlist in a mode-0600 JSONL file", () => {
    const directory = mkdtempSync(join(tmpdir(), "create-task-canary-audit-"));
    const filePath = join(directory, "nested", "audit.jsonl");
    const sink = _testExports.createFileCanaryAuditSink(filePath);
    const record: CreateTaskCanaryAuditRecord = {
      correlationId: "ct-0123456789ab",
      requestMetadataHash: "1".repeat(64),
      argsIdempotencyKeyHash: "2".repeat(64),
      effectiveKeyHash: "3".repeat(64),
      resultCode: "write_disabled",
      elapsedMs: 1,
    };
    sink(record);
    expect(JSON.parse(readFileSync(filePath, "utf8").trim())).toEqual(record);
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
    expect(statSync(join(directory, "nested")).mode & 0o777).toBe(0o700);
  });

  it.each([undefined, "", "false", "TRUE", "1"])(
    "returns global write_disabled before service for %s",
    async value => {
      const service = { execute: vi.fn() };
      const records: CreateTaskCanaryAuditRecord[] = [];
      const result = await handler(
        { ...inboxInput, name: "private task", note: "private note" },
        extra("request-private"),
        service,
        { OMNIFOCUS_CREATE_TASK_ENABLED: value },
        record => records.push(record),
      );
      expect(service.execute).not.toHaveBeenCalled();
      expect(records[0].resultCode).toBe("write_disabled");
      expect(JSON.parse(result.content[0].text).error).toMatchObject({
        code: "write_disabled",
        mayHaveWritten: false,
      });
    },
  );
});
