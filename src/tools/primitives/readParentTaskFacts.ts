import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { open, unlink } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { promisify } from "util";
import { z } from "zod";
import {
  parentTaskFactsSchema,
  type ParentReadFailureReason,
  type ParentTaskFactsRead,
} from "../../domain/taskCreation/parentDestination.js";

const nativeReadFailureReasonSchema = z.enum([
  "not_found",
  "query_failed",
  "schema_drift",
  "unknown_status",
  "malformed_id",
  "canonical_id_mismatch",
  "parent_chain_unreadable",
  "ancestor_state_unknown",
  "parent_chain_cycle",
  "orphan_parent",
]);

const nativeEnvelopeSchema = z.discriminatedUnion("success", [
  z.object({
    success: z.literal(true),
    facts: parentTaskFactsSchema,
  }).strict(),
  z.object({
    success: z.literal(false),
    reason: nativeReadFailureReasonSchema,
  }).strict(),
]);

export interface ParentFactsReadProcessResult {
  stdout: string;
  stderr: string;
}

export type ParentFactsReadRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<ParentFactsReadProcessResult>;

export interface ParentFactsReadOptions {
  executable?: string;
  scriptPath?: string;
  temporaryDirectory?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  runner?: ParentFactsReadRunner;
}

const execFileAsync = promisify(execFile);
const defaultRunner: ParentFactsReadRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    encoding: "utf8",
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export async function readParentTaskFactsById(
  parentTaskId: string,
  options: ParentFactsReadOptions = {},
): Promise<ParentTaskFactsRead> {
  if (parentTaskId.length < 1 || parentTaskId.length > 512) {
    return { success: false, reason: "malformed_id" };
  }

  const inputPath = join(
    options.temporaryDirectory ?? tmpdir(),
    `omnifocus-parent-facts-${randomUUID()}.json`,
  );
  try {
    const handle = await open(inputPath, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify({ parentTaskId }), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    const runner = options.runner ?? defaultRunner;
    const { stdout } = await runner(
      options.executable ?? "/usr/bin/osascript",
      ["-l", "JavaScript", options.scriptPath ?? resolveParentFactsScriptPath(), inputPath],
      {
        timeout: options.timeoutMs ?? 15_000,
        maxBuffer: options.maxBufferBytes ?? 128 * 1024,
      },
    );
    const trimmed = stdout.trim();
    if (trimmed.length === 0) return failure("adapter_failed");
    let decoded: unknown;
    try {
      decoded = JSON.parse(trimmed) as unknown;
    } catch {
      return failure("adapter_failed");
    }
    const parsed = nativeEnvelopeSchema.safeParse(decoded);
    if (!parsed.success) return failure("adapter_failed");
    if (!parsed.data.success) return parsed.data;
    if (parsed.data.facts.id !== parentTaskId) {
      return failure("canonical_id_mismatch");
    }
    return parsed.data;
  } catch {
    return failure("query_failed");
  } finally {
    await unlink(inputPath).catch(() => undefined);
  }
}

function failure(reason: ParentReadFailureReason): ParentTaskFactsRead {
  return { success: false, reason };
}

function resolveParentFactsScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "utils", "omnifocusScripts", "readParentTaskFacts.js");
}

export const _testExports = {
  nativeEnvelopeSchema,
  resolveParentFactsScriptPath,
};
