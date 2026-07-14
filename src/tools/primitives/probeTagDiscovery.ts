import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { z } from 'zod';

export type TagDiscoveryProbeFailureReason =
  | 'process_failure'
  | 'timeout_or_abort'
  | 'output_limit'
  | 'invalid_json_stdout'
  | 'raw_schema_drift'
  | 'unknown_status'
  | 'id_roundtrip_mismatch'
  | 'capability_unavailable';

const summarySchema = z.object({
  snapshotCount: z.number().int().nonnegative(),
  roundtripChecked: z.number().int().nonnegative(),
  active: z.number().int().nonnegative(),
  onHold: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
  roots: z.number().int().nonnegative(),
  nested: z.number().int().nonnegative(),
  mutuallyExclusiveParents: z.number().int().nonnegative(),
}).strict();

export type TagDiscoveryProbeSummary = z.infer<typeof summarySchema>;
export type TagDiscoveryProbeResult =
  | { success: true; summary: TagDiscoveryProbeSummary }
  | { success: false; reason: TagDiscoveryProbeFailureReason; error: string };

export interface TagDiscoveryProbeProcessResult {
  stdout: string;
  stderr: string;
}

export type TagDiscoveryProbeRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<TagDiscoveryProbeProcessResult>;

export interface TagDiscoveryProbeOptions {
  executable?: string;
  scriptPath?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  runner?: TagDiscoveryProbeRunner;
}

const execFileAsync = promisify(execFile);
const defaultRunner: TagDiscoveryProbeRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    encoding: 'utf8',
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

const nativeFailureReasonSchema = z.enum([
  'process_failure',
  'raw_schema_drift',
  'unknown_status',
  'id_roundtrip_mismatch',
  'capability_unavailable',
]);
const nativeEnvelopeSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), summary: summarySchema }).strict(),
  z.object({ success: z.literal(false), reason: nativeFailureReasonSchema }).strict(),
]);

export async function probeTagDiscoveryCapabilities(
  options: TagDiscoveryProbeOptions = {},
): Promise<TagDiscoveryProbeResult> {
  const runner = options.runner ?? defaultRunner;
  try {
    const { stdout } = await runner(
      options.executable ?? '/usr/bin/osascript',
      ['-l', 'JavaScript', options.scriptPath ?? resolveProbeScriptPath()],
      {
        timeout: options.timeoutMs ?? 15_000,
        maxBuffer: options.maxBufferBytes ?? 64 * 1024,
      },
    );
    const trimmed = stdout.trim();
    if (trimmed.length === 0) throw new SyntaxError('invalid_json_stdout');
    const parsed = nativeEnvelopeSchema.safeParse(JSON.parse(trimmed) as unknown);
    if (!parsed.success) return failure('raw_schema_drift');
    if (!parsed.data.success) return failure(parsed.data.reason);

    const summary = parsed.data.summary;
    if (summary.snapshotCount !== summary.roundtripChecked) {
      return failure('id_roundtrip_mismatch');
    }
    if (summary.snapshotCount !== summary.active + summary.onHold + summary.dropped) {
      return failure('raw_schema_drift');
    }
    if (summary.snapshotCount !== summary.roots + summary.nested) {
      return failure('raw_schema_drift');
    }
    return { success: true, summary };
  } catch (error) {
    return failure(classifyFailure(error));
  }
}

function resolveProbeScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'utils', 'omnifocusScripts', 'probeTagDiscovery.js');
}

function classifyFailure(error: unknown): TagDiscoveryProbeFailureReason {
  const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
  if (candidate.killed || candidate.signal === 'SIGTERM') return 'timeout_or_abort';
  if (candidate.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output_limit';
  if (error instanceof SyntaxError) return 'invalid_json_stdout';
  return 'process_failure';
}

function failure(reason: TagDiscoveryProbeFailureReason): TagDiscoveryProbeResult {
  return {
    success: false,
    reason,
    error: 'The OmniFocus Tag capability probe did not produce a trustworthy result.',
  };
}

export const _testExports = {
  classifyFailure,
  resolveProbeScriptPath,
};
