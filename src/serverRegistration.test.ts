import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Logger } from "./utils/logger.js";
import type { ZodRawShape } from "zod";
import {
  ALL_TOOL_NAMES,
  PERSONAL_PRODUCTION_TOOL_NAMES,
  registerResourcesForProfile,
  registerToolsForProfile,
} from "./serverRegistration.js";

const EXPECTED_PRODUCTION_TOOLS = [
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

type RegistrationRecorder = {
  toolNames: string[];
  resourceNames: string[];
  toolConfigs: Map<string, { inputSchema?: ZodRawShape; outputSchema?: ZodRawShape }>;
  server: McpServer;
  logger: Logger;
};

function createRegistrationRecorder(): RegistrationRecorder {
  const toolNames: string[] = [];
  const resourceNames: string[] = [];
  const toolConfigs = new Map<
    string,
    { inputSchema?: ZodRawShape; outputSchema?: ZodRawShape }
  >();
  const server = {
    tool(name: string): void {
      toolNames.push(name);
    },
    registerTool(
      name: string,
      config: { inputSchema?: ZodRawShape; outputSchema?: ZodRawShape },
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
  it("registers exactly the four Domain read tools and no resources for personal-production", () => {
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
    };
    for (const [toolName, payloadField] of Object.entries(expectedEnvelopeFields)) {
      const outputSchema = recorder.toolConfigs.get(toolName)?.outputSchema;
      expect(outputSchema).toBeDefined();
      expect(Object.keys(outputSchema ?? {})).toEqual(
        expect.arrayContaining(["success", payloadField]),
      );
    }
  });

  it("registers the complete upstream tool and resource surface for upstream-full", () => {
    const recorder = createRegistrationRecorder();
    const productionRecorder = createRegistrationRecorder();

    registerToolsForProfile(recorder.server, "upstream-full");
    registerResourcesForProfile(recorder.server, recorder.logger, "upstream-full");
    registerToolsForProfile(productionRecorder.server, "personal-production");

    expect(recorder.toolNames.sort()).toEqual(EXPECTED_FULL_TOOLS);
    expect(ALL_TOOL_NAMES.slice().sort()).toEqual(EXPECTED_FULL_TOOLS);
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

    for (const toolName of EXPECTED_PRODUCTION_TOOLS) {
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
