import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape, ZodTypeAny } from "zod";
import type { ServerProfile } from "./config/serverProfile.js";
import { registerResources } from "./resources/index.js";
import { Logger } from "./utils/logger.js";
import type { RequestHandlerExtra } from "./types/sdkProtocolCompat.js";

import * as dumpDatabaseTool from "./tools/definitions/dumpDatabase.js";
import * as addOmniFocusTaskTool from "./tools/definitions/addOmniFocusTask.js";
import * as addProjectTool from "./tools/definitions/addProject.js";
import * as removeItemTool from "./tools/definitions/removeItem.js";
import * as editItemTool from "./tools/definitions/editItem.js";
import * as batchAddItemsTool from "./tools/definitions/batchAddItems.js";
import * as batchRemoveItemsTool from "./tools/definitions/batchRemoveItems.js";
import * as queryOmniFocusTool from "./tools/definitions/queryOmnifocus.js";
import * as getTaskTool from "./tools/definitions/getTask.js";
import * as getProjectTool from "./tools/definitions/getProject.js";
import * as getCompletedSinceTool from "./tools/definitions/getCompletedSince.js";
import * as getLeanSnapshotTool from "./tools/definitions/getLeanSnapshot.js";
import * as searchTagsTool from "./tools/definitions/searchTags.js";
import * as listPerspectivesTool from "./tools/definitions/listPerspectives.js";
import * as getPerspectiveViewTool from "./tools/definitions/getPerspectiveView.js";
import * as listTagsTool from "./tools/definitions/listTags.js";
import * as createTagTool from "./tools/definitions/createTag.js";
import * as createTaskTool from "./tools/definitions/createTask.js";

type ToolModule = {
  schema: { shape: ZodRawShape };
  inputSchema?: ZodTypeAny;
  outputSchema?: ZodRawShape;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: unknown;
};

type RegistryToolHandler = (
  args: Record<string, unknown>,
  extra: RequestHandlerExtra,
) => CallToolResult | Promise<CallToolResult>;

type RegistryMcpServer = {
  registerTool(
    name: string,
    config: {
      description?: string;
      inputSchema: ZodRawShape | ZodTypeAny;
      outputSchema: ZodRawShape;
      annotations?: ToolModule["annotations"];
    },
    handler: RegistryToolHandler,
  ): void;
  tool(
    name: string,
    description: string,
    inputSchema: ZodRawShape,
    handler: RegistryToolHandler,
  ): void;
};

type ToolRegistration = {
  name: string;
  description: string;
  tool: ToolModule;
  profiles: readonly ServerProfile[];
};

export const TOOL_REGISTRY: readonly ToolRegistration[] = [
  {
    name: "dump_database",
    description: "Gets the current state of your OmniFocus database",
    tool: dumpDatabaseTool,
    profiles: ["upstream-full"],
  },
  {
    name: "add_omnifocus_task",
    description: "Create a NEW task in OmniFocus. Use this ONLY when the task does not already exist. If a matching task already exists (e.g. an item already in the Inbox, or one referenced earlier in the conversation) and the goal is to file/place/move it into a project or the inbox, do NOT create a duplicate here — use edit_item with newProjectName to MOVE the existing task instead. When unsure whether a matching task already exists, search with query_omnifocus first and prefer moving over creating.",
    tool: addOmniFocusTaskTool,
    profiles: ["upstream-full"],
  },
  {
    name: "add_project",
    description: "Add a new project to OmniFocus",
    tool: addProjectTool,
    profiles: ["upstream-full"],
  },
  {
    name: "remove_item",
    description: "Remove a task or project from OmniFocus",
    tool: removeItemTool,
    profiles: ["upstream-full"],
  },
  {
    name: "edit_item",
    description: "Edit an existing task or project in OmniFocus. This is also how you MOVE/reassign an existing task: set newProjectName to a project name/path to move it into that project, or to \"\" / \"inbox\" to move it to the inbox. Whenever a task already exists, prefer moving it with this tool over creating a new one via add_omnifocus_task, so you never create duplicates.",
    tool: editItemTool,
    profiles: ["upstream-full"],
  },
  {
    name: "batch_add_items",
    description: "Add multiple tasks or projects to OmniFocus in a single operation",
    tool: batchAddItemsTool,
    profiles: ["upstream-full"],
  },
  {
    name: "batch_remove_items",
    description: "Remove multiple tasks or projects from OmniFocus in a single operation",
    tool: batchRemoveItemsTool,
    profiles: ["upstream-full"],
  },
  {
    name: "query_omnifocus",
    description: "Efficiently query OmniFocus database with powerful filters. Get specific tasks, projects, or folders without loading the entire database. Supports filtering by project, tags, status, due dates, and more. Much faster than dump_database for targeted queries.",
    tool: queryOmniFocusTool,
    profiles: ["upstream-full"],
  },
  {
    name: "get_task",
    description: "Read-only. Get one exact OmniFocus task by ID or exact name.",
    tool: getTaskTool,
    profiles: ["personal-production", "upstream-full"],
  },
  {
    name: "get_project",
    description: "Read-only. Get one exact OmniFocus project by canonical ID or exact name.",
    tool: getProjectTool,
    profiles: ["personal-production", "upstream-full"],
  },
  {
    name: "get_completed_since",
    description: "Read-only. Return directly completed OmniFocus actions and action groups within an inclusive absolute time range. Project root completion events are excluded.",
    tool: getCompletedSinceTool,
    profiles: ["personal-production", "upstream-full"],
  },
  {
    name: "get_lean_snapshot",
    description: "Read-only. Return a capped all-system current-state OmniFocus snapshot containing active project summaries, factual attention signals, and Inbox task summaries. Waiting, recent completion history, health, risk, priority, and recommendations are not inferred.",
    tool: getLeanSnapshotTool,
    profiles: ["personal-production", "upstream-full"],
  },
  {
    name: "search_tags",
    description: "Read-only. Search existing OmniFocus Tags with canonical IDs, exact native status, full hierarchy paths, and mutual-exclusion facts. Defaults to Active Tags. Use full paths to distinguish same-name Tags. Results are discovery facts, not write authorization, and this Tool never creates Tags.",
    tool: searchTagsTool,
    profiles: ["personal-production"],
  },
  {
    name: "create_task",
    description: "Create exactly one new OmniFocus task after an explicit user request. destination is required and must be either Inbox or one exact Active Project canonical ID returned by a fresh get_project read. Before a Project call, restate the Project name and available Folder/type context so the user can associate the confirmed target with this mutation; if the target is not distinguishable, do not call. Generate a fresh UUID idempotencyKey per new creation intent and reuse it only for a transparent retry. This server may return write_disabled without touching OmniFocus. V2 does not support parent tasks, tags, repeats, notifications, batches, or updates, and never falls back to Inbox.",
    tool: createTaskTool,
    profiles: ["personal-production"],
  },
  {
    name: "list_perspectives",
    description: "List all available perspectives in OmniFocus, including built-in perspectives (Inbox, Projects, Tags, etc.) and custom perspectives (Pro feature)",
    tool: listPerspectivesTool,
    profiles: ["upstream-full"],
  },
  {
    name: "get_perspective_view",
    description: "Get the items visible in a specific OmniFocus perspective. Shows what tasks and projects are displayed when viewing that perspective",
    tool: getPerspectiveViewTool,
    profiles: ["upstream-full"],
  },
  {
    name: "list_tags",
    description: "List all tags in OmniFocus with their hierarchy. Useful for discovering available tags before creating or editing tasks.",
    tool: listTagsTool,
    profiles: ["upstream-full"],
  },
  {
    name: "create_tag",
    description: "Create a new tag in OmniFocus, optionally nested under an existing parent tag",
    tool: createTagTool,
    profiles: ["upstream-full"],
  },
];

export const ALL_TOOL_NAMES = TOOL_REGISTRY.map(({ name }) => name);
export const PERSONAL_PRODUCTION_TOOL_NAMES = TOOL_REGISTRY
  .filter(({ profiles }) => profiles.includes("personal-production"))
  .map(({ name }) => name);

export function registerToolsForProfile(
  server: McpServer,
  profile: ServerProfile
): void {
  const registrations = TOOL_REGISTRY.filter(
    registration => registration.profiles.includes(profile)
  );
  const registryServer = server as RegistryMcpServer;

  for (const registration of registrations) {
    const handler = registration.tool.handler as RegistryToolHandler;
    if (registration.tool.outputSchema) {
      registryServer.registerTool(
        registration.name,
        {
          description: registration.description,
          inputSchema: registration.tool.inputSchema ?? registration.tool.schema.shape,
          outputSchema: registration.tool.outputSchema,
          annotations: registration.tool.annotations,
        },
        handler,
      );
    } else {
      registryServer.tool(
        registration.name,
        registration.description,
        registration.tool.schema.shape,
        handler,
      );
    }
  }
}

export function registerResourcesForProfile(
  server: McpServer,
  logger: Logger,
  profile: ServerProfile
): void {
  if (profile === "upstream-full") {
    registerResources(server, logger);
  }
}
