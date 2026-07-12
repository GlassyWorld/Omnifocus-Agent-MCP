import { describe, expect, it } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Logger } from "./utils/logger.js";
import {
  ALL_TOOL_NAMES,
  PERSONAL_READONLY_TOOL_NAMES,
  registerResourcesForProfile,
  registerToolsForProfile,
} from "./serverRegistration.js";

const EXPECTED_READONLY_TOOLS = [
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
  server: McpServer;
  logger: Logger;
};

function createRegistrationRecorder(): RegistrationRecorder {
  const toolNames: string[] = [];
  const resourceNames: string[] = [];
  const server = {
    tool(name: string): void {
      toolNames.push(name);
    },
    resource(name: string): void {
      resourceNames.push(name);
    },
  } as unknown as McpServer;
  const logger = {
    info(): void {},
  } as unknown as Logger;

  return { toolNames, resourceNames, server, logger };
}

describe("profile-specific server registration", () => {
  it("registers exactly the four Domain read tools and no resources for personal-readonly", () => {
    const recorder = createRegistrationRecorder();

    registerToolsForProfile(recorder.server, "personal-readonly");
    registerResourcesForProfile(recorder.server, recorder.logger, "personal-readonly");

    expect(recorder.toolNames.sort()).toEqual(EXPECTED_READONLY_TOOLS);
    expect(PERSONAL_READONLY_TOOL_NAMES.slice().sort()).toEqual(EXPECTED_READONLY_TOOLS);
    expect(recorder.resourceNames).toEqual([]);
  });

  it("registers the complete upstream tool and resource surface for upstream-full", () => {
    const recorder = createRegistrationRecorder();

    registerToolsForProfile(recorder.server, "upstream-full");
    registerResourcesForProfile(recorder.server, recorder.logger, "upstream-full");

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
  });
});
