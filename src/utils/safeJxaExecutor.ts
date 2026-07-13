import { execFile } from "child_process";
import { randomUUID } from "crypto";
import { open, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { CreateTaskOperationError } from "../domain/taskCreation/createTaskErrors.js";

export interface ProcessResult {
  stdout: string;
  stderr: string;
}

export type SafeProcessRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<ProcessResult>;

const execFileAsync = promisify(execFile);

const defaultRunner: SafeProcessRunner = async (executable, args, options) => {
  const result = await execFileAsync(executable, [...args], {
    timeout: options.timeout,
    maxBuffer: options.maxBuffer,
    encoding: "utf8",
  });
  return { stdout: result.stdout, stderr: result.stderr };
};

export interface SafeJxaExecutorOptions {
  executable?: string;
  temporaryDirectory?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
  runner?: SafeProcessRunner;
}

export class SafeJxaExecutor {
  private readonly executable: string;
  private readonly temporaryDirectory: string;
  private readonly timeoutMs: number;
  private readonly maxBufferBytes: number;
  private readonly runner: SafeProcessRunner;

  constructor(options: SafeJxaExecutorOptions = {}) {
    this.executable = options.executable ?? "/usr/bin/osascript";
    this.temporaryDirectory = options.temporaryDirectory ?? tmpdir();
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxBufferBytes = options.maxBufferBytes ?? 256 * 1024;
    this.runner = options.runner ?? defaultRunner;
  }

  async execute(scriptPath: string, payload: unknown): Promise<unknown> {
    const payloadPath = join(
      this.temporaryDirectory,
      `omnifocus-create-task-${randomUUID()}.json`,
    );
    const handle = await open(payloadPath, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(payload), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    try {
      const { stdout } = await this.runner(
        this.executable,
        ["-l", "JavaScript", scriptPath, payloadPath],
        { timeout: this.timeoutMs, maxBuffer: this.maxBufferBytes },
      );
      const trimmed = stdout.trim();
      if (trimmed.length === 0) {
        throw new Error("empty stdout");
      }
      return JSON.parse(trimmed) as unknown;
    } catch (error) {
      throw new CreateTaskOperationError({
        code: "verification_failed",
        message: "The OmniFocus creation process ended without a trustworthy result.",
        mayHaveWritten: true,
        retrySafe: false,
        reason: this.classifyFailure(error),
      });
    } finally {
      await unlink(payloadPath).catch(() => undefined);
    }
  }

  private classifyFailure(error: unknown): string {
    const candidate = error as NodeJS.ErrnoException & { killed?: boolean; signal?: string };
    if (candidate.killed || candidate.signal === "SIGTERM") return "timeout_or_abort";
    if (error instanceof SyntaxError) return "invalid_json_stdout";
    if (error instanceof Error && error.message === "empty stdout") return "empty_stdout";
    if (candidate.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") return "output_limit";
    return "process_failure";
  }
}
