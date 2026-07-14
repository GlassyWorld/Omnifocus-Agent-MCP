import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import * as createTaskTool from "./createTask.js";

const key = "123e4567-e89b-42d3-a456-426614174000";
const baseCreated = {
  id: "task-1",
  name: "Task",
  note: "",
  location: { kind: "inbox" as const },
  plannedDate: null,
  dueDate: null,
  deferDate: null,
  flagged: false,
  estimatedMinutes: null,
};

function success(tagIds?: string[]) {
  return {
    success: true as const,
    created: tagIds === undefined ? baseCreated : { ...baseCreated, tagIds },
    idempotency: {
      key,
      replayed: false,
      replayUntil: "2026-07-15T00:00:00.000Z",
    },
    warnings: [],
  };
}

async function createProtocolHarness(
  service: createTaskTool.CreateTaskHandlerService,
  env: NodeJS.ProcessEnv,
  auditSink: createTaskTool.CreateTaskCanaryAuditSink = vi.fn(),
) {
  const server = new McpServer({ name: "create-task-test-server", version: "1.0.0" });
  server.registerTool(
    "create_task",
    {
      description: "Create one guarded task with optional existing Active Tag IDs.",
      inputSchema: createTaskTool.inputSchema,
      outputSchema: createTaskTool.outputSchema,
      annotations: createTaskTool.annotations,
    },
    (args, extra) => createTaskTool.handler(args, extra, service, env, auditSink),
  );
  const client = new Client({ name: "create-task-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { server, client };
}

describe("create_task V3 MCP protocol contract", () => {
  it("roundtrips branch-specific no-tag and tagged structured success", async () => {
    const service: createTaskTool.CreateTaskHandlerService = {
      execute: vi.fn(async input => input.tagIds === undefined
        ? success()
        : success(["tag-a"])),
    };
    const { server, client } = await createProtocolHarness(service, {
      OMNIFOCUS_CREATE_TASK_ENABLED: "true",
      OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: "true",
    });
    try {
      for (const arguments_ of [
        { name: "Task", destination: { kind: "inbox" }, idempotencyKey: key },
        {
          name: "Task",
          destination: { kind: "inbox" },
          idempotencyKey: key,
          tagIds: ["tag-a"],
        },
      ]) {
        const result = await client.callTool({ name: "create_task", arguments: arguments_ });
        expect(result.isError).not.toBe(true);
        expect(result.structuredContent).toEqual(
          JSON.parse((result.content as Array<{ text: string }>)[0].text),
        );
      }
      expect(service.execute).toHaveBeenCalledTimes(2);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("rejects duplicate tagIds at runtime before service dispatch", async () => {
    const service = { execute: vi.fn() };
    const { server, client } = await createProtocolHarness(service, {
      OMNIFOCUS_CREATE_TASK_ENABLED: "true",
      OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: "true",
    });
    try {
      const result = await client.callTool({
        name: "create_task",
        arguments: {
          name: "Task",
          destination: { kind: "inbox" },
          idempotencyKey: key,
          tagIds: ["tag-a", "tag-a"],
        },
      });
      expect(result.isError).toBe(true);
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text).error.code)
        .toBe("invalid_arguments");
      expect(service.execute).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("fails closed at the Tag gate without dispatch or structuredContent", async () => {
    const service = { execute: vi.fn() };
    const records: createTaskTool.CreateTaskCanaryAuditRecord[] = [];
    const { server, client } = await createProtocolHarness(
      service,
      { OMNIFOCUS_CREATE_TASK_ENABLED: "true" },
      record => records.push(record),
    );
    try {
      const result = await client.callTool({
        name: "create_task",
        arguments: {
          name: "Task",
          destination: { kind: "inbox" },
          idempotencyKey: key,
          tagIds: ["private-tag-id"],
        },
      });
      expect(result.isError).toBe(true);
      expect(result).not.toHaveProperty("structuredContent");
      expect(JSON.parse((result.content as Array<{ text: string }>)[0].text).error)
        .toMatchObject({
          code: "write_disabled",
          reason: "tag_assignment_disabled",
          mayHaveWritten: false,
        });
      expect(service.execute).not.toHaveBeenCalled();
      expect(records[0].resultCode).toBe("write_disabled.tag_assignment_disabled");
      expect(JSON.stringify(records)).not.toContain("private-tag-id");
    } finally {
      await client.close();
      await server.close();
    }
  });
});
