import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Logger } from "./utils/logger.js";
import type { ZodRawShape, ZodTypeAny } from "zod";
import {
  ALL_TOOL_NAMES,
  PERSONAL_PRODUCTION_TOOL_NAMES,
  registerResourcesForProfile,
  registerToolsForProfile,
} from "./serverRegistration.js";

const EXPECTED_PRODUCTION_TOOLS = [
  "create_task",
  "get_lean_snapshot",
  "get_project",
  "get_task",
  "get_completed_since",
].sort();

const EXPECTED_FULL_TOOLS = [
  "dump_database",
  "add_omnifocus_task",
  "add_project",
  "remove_item",
  "edit_item",
  "batch_add_items",
  "batch_remove_items",
  "query_omnifocus",
  "get_task",
  "get_project",
  "get_completed_since",
  "get_lean_snapshot",
  "list_perspectives",
  "get_perspective_view",
  "list_tags",
  "create_tag",
].sort();

const EXPECTED_ALL_TOOLS = [...EXPECTED_FULL_TOOLS, "create_task"].sort();

type RegistrationRecorder = {
  toolNames: string[];
  resourceNames: string[];
  toolConfigs: Map<string, { inputSchema?: ZodRawShape | ZodTypeAny; outputSchema?: ZodRawShape; annotations?: Record<string, unknown> }>;
  server: McpServer;
  logger: Logger;
};

function createRegistrationRecorder(): RegistrationRecorder {
  const toolNames: string[] = [];
  const resourceNames: string[] = [];
  const toolConfigs = new Map<
    string,
    { inputSchema?: ZodRawShape | ZodTypeAny; outputSchema?: ZodRawShape; annotations?: Record<string, unknown> }
  >();
  const server = {
    tool(name: string): void {
      toolNames.push(name);
    },
    registerTool(
      name: string,
      config: { inputSchema?: ZodRawShape | ZodTypeAny; outputSchema?: ZodRawShape; annotations?: Record<string, unknown> },
    ): void {
      toolNames.push(name);
      toolConfigs.set(name, config);
    },
    resource(name: string): void {
      resourceNames.push(name);
    },
  } as unknown as McpServer;
  const logger = {
    info(): void {},
  } as unknown as Logger;

  return { toolNames, resourceNames, toolConfigs, server, logger };
}

describe("profile-specific server registration", () => {
  it("publishes the complete required create_task JSON Schema over MCP", async () => {
    const server = new McpServer({ name: "schema-test-server", version: "1.0.0" });
    const client = new Client({ name: "schema-test-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    registerToolsForProfile(server, "personal-production");

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const listed = await client.listTools();
      const createTask = listed.tools.find(tool => tool.name === "create_task");

      expect(createTask?.inputSchema.type).toBe("object");
      expect(Object.keys(createTask?.inputSchema.properties ?? {}).sort()).toEqual([
        "deferDate",
        "dueDate",
        "estimatedMinutes",
        "flagged",
        "idempotencyKey",
        "name",
        "note",
        "plannedDate",
      ]);
      expect(createTask?.inputSchema.required?.slice().sort()).toEqual([
        "idempotencyKey",
        "name",
      ]);
      expect(createTask?.inputSchema.additionalProperties).toBe(false);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("registers exactly four Domain reads plus the write-disabled-capable create_task and no resources for personal-production", () => {
    const recorder = createRegistrationRecorder();

    registerToolsForProfile(recorder.server, "personal-production");
    registerResourcesForProfile(recorder.server, recorder.logger, "personal-production");

    expect(recorder.toolNames.sort()).toEqual(EXPECTED_PRODUCTION_TOOLS);
    expect(PERSONAL_PRODUCTION_TOOL_NAMES.slice().sort()).toEqual(EXPECTED_PRODUCTION_TOOLS);
    expect(recorder.resourceNames).toEqual([]);

    const expectedEnvelopeFields: Record<string, string> = {
      get_task: "task",
      get_project: "project",
      get_completed_since: "completed",
      get_lean_snapshot: "snapshot",
      create_task: "created",
    };
    for (const [toolName, payloadField] of Object.entries(expectedEnvelopeFields)) {
      const outputSchema = recorder.toolConfigs.get(toolName)?.outputSchema;
      expect(outputSchema).toBeDefined();
      expect(Object.keys(outputSchema ?? {})).toEqual(
        expect.arrayContaining(["success", payloadField]),
      );
    }
    expect(recorder.toolConfigs.get("create_task")?.annotations).toEqual({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
      idempotentHint: true,
    });
    const createInputSchema = recorder.toolConfigs.get("create_task")?.inputSchema as ZodTypeAny;
    expect(createInputSchema.safeParse({ name: "Task" }).success).toBe(false);
    expect(createInputSchema.safeParse({
      name: "Task",
      idempotencyKey: "123e4567-e89b-42d3-a456-426614174000",
    }).success).toBe(true);
    expect(createInputSchema.safeParse({ name: "Task", destination: { kind: "inbox" } }).success).toBe(false);
  });

  it("registers the complete upstream tool and resource surface for upstream-full", () => {
    const recorder = createRegistrationRecorder();
    const productionRecorder = createRegistrationRecorder();

    registerToolsForProfile(recorder.server, "upstream-full");
    registerResourcesForProfile(recorder.server, recorder.logger, "upstream-full");
    registerToolsForProfile(productionRecorder.server, "personal-production");

    expect(recorder.toolNames.sort()).toEqual(EXPECTED_FULL_TOOLS);
    expect(ALL_TOOL_NAMES.slice().sort()).toEqual(EXPECTED_ALL_TOOLS);
    expect(recorder.resourceNames.sort()).toEqual([
      "flagged",
      "inbox",
      "perspective",
      "project",
      "stats",
      "today",
    ]);
    expect(recorder.toolNames).toContain("get_lean_snapshot");
    expect(recorder.toolNames).toContain("add_omnifocus_task");
    expect(recorder.toolNames).not.toContain("create_task");

    for (const toolName of EXPECTED_PRODUCTION_TOOLS.filter(name => name !== "create_task")) {
      const fullOutputSchema = recorder.toolConfigs.get(toolName)?.outputSchema;
      const productionOutputSchema = productionRecorder.toolConfigs.get(toolName)?.outputSchema;
      expect(fullOutputSchema).toBeDefined();
      expect(productionOutputSchema).toBe(fullOutputSchema);
    }
    for (const legacyToolName of EXPECTED_FULL_TOOLS.filter(
      name => !EXPECTED_PRODUCTION_TOOLS.includes(name),
    )) {
      expect(recorder.toolConfigs.has(legacyToolName)).toBe(false);
    }
  });
});
