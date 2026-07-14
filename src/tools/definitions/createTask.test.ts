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

function extra(requestId: string | number = 1) {
  return { requestId } as Parameters<typeof handler>[1];
}

describe("create_task handler", () => {
  it("publishes a strict V2 schema with required destination and idempotencyKey", () => {
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
    ]);
    expect(schema.safeParse(inboxInput).success).toBe(true);
    expect(schema.safeParse({ name: "Task", idempotencyKey: key }).success).toBe(false);
    expect(schema.safeParse({
      name: "Task",
      destination: { kind: "project", projectId: "project-1" },
      idempotencyKey: key,
    }).success).toBe(true);
    expect(inputSchema.safeParse({ name: "Task", destination: { kind: "inbox" } }).success).toBe(false);
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
