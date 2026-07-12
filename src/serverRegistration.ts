import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShape } from "zod";
import { ServerProfile } from "./config/serverProfile.js";
import { registerResources } from "./resources/index.js";
import { Logger } from "./utils/logger.js";

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
import * as listPerspectivesTool from "./tools/definitions/listPerspectives.js";
import * as getPerspectiveViewTool from "./tools/definitions/getPerspectiveView.js";
import * as listTagsTool from "./tools/definitions/listTags.js";
import * as createTagTool from "./tools/definitions/createTag.js";

type ToolModule = {
  schema: { shape: ZodRawShape };
  handler: unknown;
};

type ToolRegistration = {
  name: string;
  description: string;
  tool: ToolModule;
  personalReadonly: boolean;
};

export const TOOL_REGISTRY: readonly ToolRegistration[] = [
  {
    name: "dump_database",
    description: "Gets the current state of your OmniFocus database",
    tool: dumpDatabaseTool,
    personalReadonly: false,
  },
  {
    name: "add_omnifocus_task",
    description: "Create a NEW task in OmniFocus. Use this ONLY when the task does not already exist. If a matching task already exists (e.g. an item already in the Inbox, or one referenced earlier in the conversation) and the goal is to file/place/move it into a project or the inbox, do NOT create a duplicate here — use edit_item with newProjectName to MOVE the existing task instead. When unsure whether a matching task already exists, search with query_omnifocus first and prefer moving over creating.",
    tool: addOmniFocusTaskTool,
    personalReadonly: false,
  },
  {
    name: "add_project",
    description: "Add a new project to OmniFocus",
    tool: addProjectTool,
    personalReadonly: false,
  },
  {
    name: "remove_item",
    description: "Remove a task or project from OmniFocus",
    tool: removeItemTool,
    personalReadonly: false,
  },
  {
    name: "edit_item",
    description: "Edit an existing task or project in OmniFocus. This is also how you MOVE/reassign an existing task: set newProjectName to a project name/path to move it into that project, or to \"\" / \"inbox\" to move it to the inbox. Whenever a task already exists, prefer moving it with this tool over creating a new one via add_omnifocus_task, so you never create duplicates.",
    tool: editItemTool,
    personalReadonly: false,
  },
  {
    name: "batch_add_items",
    description: "Add multiple tasks or projects to OmniFocus in a single operation",
    tool: batchAddItemsTool,
    personalReadonly: false,
  },
  {
    name: "batch_remove_items",
    description: "Remove multiple tasks or projects from OmniFocus in a single operation",
    tool: batchRemoveItemsTool,
    personalReadonly: false,
  },
  {
    name: "query_omnifocus",
    description: "Efficiently query OmniFocus database with powerful filters. Get specific tasks, projects, or folders without loading the entire database. Supports filtering by project, tags, status, due dates, and more. Much faster than dump_database for targeted queries.",
    tool: queryOmniFocusTool,
    personalReadonly: false,
  },
  {
    name: "get_task",
    description: "Read-only. Get one exact OmniFocus task by ID or exact name.",
    tool: getTaskTool,
    personalReadonly: true,
  },
  {
    name: "get_project",
    description: "Read-only. Get one exact OmniFocus project by canonical ID or exact name.",
    tool: getProjectTool,
    personalReadonly: true,
  },
  {
    name: "get_completed_since",
    description: "Read-only. Return directly completed OmniFocus actions and action groups within an inclusive absolute time range. Project root completion events are excluded.",
    tool: getCompletedSinceTool,
    personalReadonly: true,
  },
  {
    name: "get_lean_snapshot",
    description: "Read-only. Return a capped all-system current-state OmniFocus snapshot containing active project summaries, factual attention signals, and Inbox task summaries. Waiting, recent completion history, health, risk, priority, and recommendations are not inferred.",
    tool: getLeanSnapshotTool,
    personalReadonly: true,
  },
  {
    name: "list_perspectives",
    description: "List all available perspectives in OmniFocus, including built-in perspectives (Inbox, Projects, Tags, etc.) and custom perspectives (Pro feature)",
    tool: listPerspectivesTool,
    personalReadonly: false,
  },
  {
    name: "get_perspective_view",
    description: "Get the items visible in a specific OmniFocus perspective. Shows what tasks and projects are displayed when viewing that perspective",
    tool: getPerspectiveViewTool,
    personalReadonly: false,
  },
  {
    name: "list_tags",
    description: "List all tags in OmniFocus with their hierarchy. Useful for discovering available tags before creating or editing tasks.",
    tool: listTagsTool,
    personalReadonly: false,
  },
  {
    name: "create_tag",
    description: "Create a new tag in OmniFocus, optionally nested under an existing parent tag",
    tool: createTagTool,
    personalReadonly: false,
  },
];

export const ALL_TOOL_NAMES = TOOL_REGISTRY.map(({ name }) => name);
export const PERSONAL_READONLY_TOOL_NAMES = TOOL_REGISTRY
  .filter(({ personalReadonly }) => personalReadonly)
  .map(({ name }) => name);

export function registerToolsForProfile(
  server: McpServer,
  profile: ServerProfile
): void {
  const registrations = profile === "personal-readonly"
    ? TOOL_REGISTRY.filter(({ personalReadonly }) => personalReadonly)
    : TOOL_REGISTRY;

  for (const registration of registrations) {
    server.tool(
      registration.name,
      registration.description,
      registration.tool.schema.shape,
      registration.tool.handler as never
    );
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
