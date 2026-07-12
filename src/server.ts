#!/usr/bin/env node

import { readFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SetLevelRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Logger } from './utils/logger.js';
import { setScriptLogger } from './utils/scriptExecution.js';
import { resolveServerProfile } from './config/serverProfile.js';
import { getServerInstructions } from './serverInstructions.js';
import {
  registerResourcesForProfile,
  registerToolsForProfile,
} from './serverRegistration.js';

// Single-source the version from package.json — the hardcoded string here
// drifted out of sync with the published version more than once.
// Works from both src/ (tsx) and dist/ (build): each is one level below the
// package root.
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf-8")
);

function resolveStartupProfile() {
  try {
    return resolveServerProfile(process.env.OMNIFOCUS_MCP_PROFILE);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const profile = resolveStartupProfile();

// Create an MCP server with profile-specific instructions.
const server = new McpServer(
  { name: "OmniFocus MCP", version },
  {
    instructions: getServerInstructions(profile),
  }
);

// Set up logging
const logger = new Logger(server.server);
setScriptLogger(logger);

server.server.registerCapabilities({ logging: {} });

server.server.setRequestHandler(SetLevelRequestSchema, async (request) => {
  logger.setLevel(request.params.level);
  logger.info("server", `Log level set to ${request.params.level}`);
  return {};
});

registerResourcesForProfile(server, logger, profile);
registerToolsForProfile(server, profile);

// Start the MCP server
const transport = new StdioServerTransport();

// Use await with server.connect to ensure proper connection
(async function() {
  try {
    console.error(`OmniFocus MCP profile: ${profile}`);
    await server.connect(transport);
  } catch (err) {
    console.error(`Failed to start MCP server: ${err}`);
    process.exitCode = 1;
  }
})();

// Exit cleanly when the MCP client goes away. Signal propagation through the
// npx/npm wrapper chain is unreliable, so we also watch stdin for EOF — when
// the client closes the transport, stdin ends and we shut down rather than
// lingering as an orphaned process.
function shutdown(): void {
  process.exit(0);
}

process.stdin.on('end', shutdown);
process.stdin.on('close', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);
process.on('SIGINT', shutdown);
