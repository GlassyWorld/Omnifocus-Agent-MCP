import { describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, statSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CreateTaskOperationError } from "../../domain/taskCreation/createTaskErrors.js";
import {
  CreateTaskCanaryAuditRecord,
  CreateTaskHandlerService,
  handler,
  inputSchema,
  schema,
  _testExports,
} from "./createTask.js";

const key = "123e4567-e89b-42d3-a456-426614174000";
const enabledEnv = { OMNIFOCUS_CREATE_TASK_ENABLED: "true" };
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
  it("keeps the public schema Inbox-only", () => {
    expect(Object.keys(schema.shape).sort()).toEqual([
      "deferDate",
      "dueDate",
      "estimatedMinutes",
      "flagged",
      "idempotencyKey",
      "name",
      "note",
      "plannedDate",
    ]);
    expect(schema.safeParse({ name: "Task", idempotencyKey: key }).success).toBe(true);
    expect(schema.safeParse({ name: "Task", idempotencyKey: key, destination: { kind: "inbox" } }).success).toBe(false);
    expect(inputSchema.safeParse({ name: "Task" }).success).toBe(false);
    expect(inputSchema.safeParse({ name: "Task", idempotencyKey: key }).success).toBe(true);
  });

  it("runs the strict object parser and rejects extra fields before service", async () => {
    const service = { execute: vi.fn() };
    const result = await handler(
      { name: "Task", idempotencyKey: key, destination: { kind: "inbox" } } as any,
      extra(),
      service,
    );
    expect(JSON.parse(result.content[0].text).error.code).toBe("invalid_arguments");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("requires an explicit key until request metadata stability is enabled", async () => {
    const service = { execute: vi.fn() };
    const result = await handler({ name: "Task" } as any, extra(), service);
    expect(JSON.parse(result.content[0].text).error.code).toBe("invalid_arguments");
    expect(service.execute).not.toHaveBeenCalled();
  });

  it("returns identical structured and JSON success", async () => {
    const service: CreateTaskHandlerService = { execute: vi.fn().mockResolvedValue(success) };
    const result = await handler(
      { name: "Task", idempotencyKey: key },
      extra(),
      service,
      enabledEnv,
      vi.fn(),
    );
    expect(result).not.toHaveProperty("isError");
    expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
    expect(service.execute).toHaveBeenCalledWith({ name: "Task", idempotencyKey: key }, key);
  });

  it("returns stable structured error text without structuredContent", async () => {
    const service: CreateTaskHandlerService = {
      execute: vi.fn().mockRejectedValue(new CreateTaskOperationError({
        code: "verification_failed",
        message: "No trustworthy readback.",
        mayHaveWritten: true,
        retrySafe: false,
        taskId: "task-1",
      })),
    };
    const result = await handler(
      { name: "Task", idempotencyKey: key },
      extra(),
      service,
      enabledEnv,
      vi.fn(),
    );
    expect(result.isError).toBe(true);
    expect(result).not.toHaveProperty("structuredContent");
    expect(JSON.parse(result.content[0].text).error).toMatchObject({
      code: "verification_failed",
      mayHaveWritten: true,
      retrySafe: false,
      taskId: "task-1",
    });
  });

  it("uses request metadata only behind the explicit stability gate", () => {
    expect(_testExports.resolveEffectiveKey(undefined, extra("request-1"), {})).toBeNull();
    expect(_testExports.resolveEffectiveKey(undefined, extra("request-1"), {
      OMNIFOCUS_MCP_STABLE_REQUEST_ID: "true",
    })).toBe("mcp:request-1");
    expect(_testExports.resolveEffectiveKey(key, extra("request-1"), {})).toBe(key);
  });

  it("logs only privacy-safe Canary audit fields", async () => {
    const records: CreateTaskCanaryAuditRecord[] = [];
    const service: CreateTaskHandlerService = { execute: vi.fn().mockResolvedValue(success) };
    await handler(
      { name: "private task", note: "private note", idempotencyKey: key },
      extra("request-private"),
      service,
      enabledEnv,
      record => records.push(record),
    );
    expect(records).toHaveLength(1);
    expect(Object.keys(records[0]).sort()).toEqual([
      "argsIdempotencyKeyHash",
      "correlationId",
      "effectiveKeyHash",
      "elapsedMs",
      "requestMetadataHash",
      "resultCode",
    ]);
    expect(records[0]).toMatchObject({
      correlationId: expect.stringMatching(/^ct-[0-9a-f]{12}$/),
      requestMetadataHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      argsIdempotencyKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      effectiveKeyHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      resultCode: "success",
      elapsedMs: expect.any(Number),
    });
    const serialized = JSON.stringify(records);
    expect(serialized).not.toContain("private task");
    expect(serialized).not.toContain("private note");
    expect(serialized).not.toContain("request-private");
    expect(serialized).not.toContain(key);
  });

  it("emits stable hashes for a transparent disabled retry", async () => {
    const first: CreateTaskCanaryAuditRecord[] = [];
    const second: CreateTaskCanaryAuditRecord[] = [];
    const input = { name: "private task", note: "private note", idempotencyKey: key };
    const request = extra("request-stable");

    await handler(input, request, undefined, {}, record => first.push(record));
    await handler(input, request, undefined, {}, record => second.push(record));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      correlationId: first[0].correlationId,
      requestMetadataHash: first[0].requestMetadataHash,
      argsIdempotencyKeyHash: first[0].argsIdempotencyKeyHash,
      effectiveKeyHash: first[0].effectiveKeyHash,
      resultCode: "write_disabled",
    });
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
    "returns the fixed canary error before calling the mutation service for %s",
    async value => {
      const service = { execute: vi.fn() };
      const records: CreateTaskCanaryAuditRecord[] = [];
      const result = await handler(
        { name: "private task", note: "private note", idempotencyKey: key },
        extra("request-private"),
        service,
        { OMNIFOCUS_CREATE_TASK_ENABLED: value },
        record => records.push(record),
      );
      expect(service.execute).not.toHaveBeenCalled();
      expect(records).toHaveLength(1);
      expect(records[0].resultCode).toBe("write_disabled");
      expect(result).toEqual({
        content: [{
          type: "text",
          text: JSON.stringify({
            success: false,
            error: {
              code: "write_disabled",
              message: "create_task is registered for canary validation but mutation is disabled.",
              mayHaveWritten: false,
              retrySafe: false,
            },
          }, null, 2),
        }],
        isError: true,
      });
      expect(JSON.stringify(result)).not.toContain("private task");
      expect(JSON.stringify(result)).not.toContain("private note");
    },
  );
});
