import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { z } from 'zod';

export type ReadTagsFailureReason =
  | 'process_failure'
  | 'timeout_or_abort'
  | 'output_limit'
  | 'invalid_json_stdout'
  | 'raw_schema_drift';

export type ReadTagsResult =
  | { success: true; tags: unknown[] }
  | { success: false; reason: ReadTagsFailureReason; error: string };

export interface ReadTagsProcessResult {
  stdout: string;
  stderr: string;
}

export type ReadTagsProcessRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<ReadTagsProcessResult>;

export interface ReadTagsOptions {
  executable?: string;
  scriptPath?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  runner?: ReadTagsProcessRunner;
}

const execFileAsync = promisify(execFile);

const defaultRunner: ReadTagsProcessRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    encoding: 'utf8',
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

const nativeFailureReasonSchema = z.enum(['process_failure', 'raw_schema_drift']);
const nativeEnvelopeSchema = z.discriminatedUnion('success', [
  z.object({ success: z.literal(true), tags: z.array(z.unknown()) }).strict(),
  z.object({ success: z.literal(false), reason: nativeFailureReasonSchema }).strict(),
]);

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BUFFER_BYTES = 256 * 1024;

export async function readTags(options: ReadTagsOptions = {}): Promise<ReadTagsResult> {
  const runner = options.runner ?? defaultRunner;
  const executable = options.executable ?? '/usr/bin/osascript';
  const scriptPath = options.scriptPath ?? resolveReadTagsScriptPath();
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

  try {
    const { stdout } = await runner(
      executable,
      ['-l', 'JavaScript', scriptPath],
      { timeout, maxBuffer },
    );
    const parsedJson = parseSingleJsonDocument(stdout);
    const envelope = nativeEnvelopeSchema.safeParse(parsedJson);
    if (!envelope.success) {
      return failure('raw_schema_drift');
    }
    if (!envelope.data.success) {
      return failure(envelope.data.reason);
    }
    return { success: true, tags: envelope.data.tags };
  } catch (error) {
    return failure(classifyProcessFailure(error));
  }
}

function resolveReadTagsScriptPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'utils', 'omnifocusScripts', 'readTags.js');
}

function parseSingleJsonDocument(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) throw new SyntaxError('invalid_json_stdout');
  return JSON.parse(trimmed) as unknown;
}

function classifyProcessFailure(error: unknown): ReadTagsFailureReason {
  const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
  if (candidate.killed || candidate.signal === 'SIGTERM') return 'timeout_or_abort';
  if (candidate.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') return 'output_limit';
  if (error instanceof SyntaxError) return 'invalid_json_stdout';
  return 'process_failure';
}

function failure(reason: ReadTagsFailureReason): ReadTagsResult {
  return {
    success: false,
    reason,
    error: 'The OmniFocus Tag snapshot could not be read safely.',
  };
}

export const _testExports = {
  DEFAULT_MAX_BUFFER_BYTES,
  DEFAULT_TIMEOUT_MS,
  classifyProcessFailure,
  parseSingleJsonDocument,
  resolveReadTagsScriptPath,
};
