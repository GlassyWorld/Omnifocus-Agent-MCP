import { createHash, randomUUID } from "crypto";
import { constants } from "fs";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
} from "fs/promises";
import { join } from "path";
import { CreateTaskOperationError } from "./createTaskErrors.js";

export type CreateTaskLedgerState =
  | "reserved"
  | "write_started"
  | "task_created"
  | "verified"
  | "retryable_validation_error"
  | "terminal_prewrite_error"
  | "verification_failed"
  | "outcome_unknown";

export interface IdempotencyLedgerRecord {
  keyHash: string;
  payloadHash: string;
  state: CreateTaskLedgerState;
  taskId?: string;
  resultCode?: string;
  createdAt: string;
  updatedAt: string;
  replayUntil?: string;
}

interface PersistedRecord {
  version: 1;
  record: IdempotencyLedgerRecord;
  checksum: string;
}

export interface CreateTaskLedgerOptions {
  stateDirectory: string;
  lockTimeoutMs?: number;
  staleLockMs?: number;
  pollIntervalMs?: number;
  now?: () => Date;
}

const ALLOWED_TRANSITIONS: Record<CreateTaskLedgerState, readonly CreateTaskLedgerState[]> = {
  reserved: ["write_started", "retryable_validation_error", "terminal_prewrite_error"],
  write_started: ["task_created", "retryable_validation_error", "terminal_prewrite_error", "outcome_unknown"],
  retryable_validation_error: ["write_started", "retryable_validation_error", "terminal_prewrite_error"],
  task_created: ["verified", "verification_failed"],
  verification_failed: ["verified"],
  verified: [],
  terminal_prewrite_error: [],
  outcome_unknown: [],
};

export function hashIdempotencyKey(key: string): string {
  return createHash("sha256").update("create_task:key:v1\0").update(key).digest("hex");
}

function checksum(record: IdempotencyLedgerRecord): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

function writeDisabled(message: string): never {
  throw new CreateTaskOperationError({
    code: "write_disabled",
    message,
    mayHaveWritten: false,
    retrySafe: false,
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export class CreateTaskLedger {
  private readonly recordsDirectory: string;
  private readonly lockPath: string;
  private readonly lockTimeoutMs: number;
  private readonly staleLockMs: number;
  private readonly pollIntervalMs: number;
  private readonly now: () => Date;

  constructor(private readonly options: CreateTaskLedgerOptions) {
    this.recordsDirectory = join(options.stateDirectory, "records");
    this.lockPath = join(options.stateDirectory, "mutation.lock");
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000;
    this.staleLockMs = options.staleLockMs ?? 30_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 25;
    this.now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    await mkdir(this.options.stateDirectory, { recursive: true, mode: 0o700 });
    await chmod(this.options.stateDirectory, 0o700);
    await mkdir(this.recordsDirectory, { recursive: true, mode: 0o700 });
    await chmod(this.recordsDirectory, 0o700);
  }

  async withGlobalLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.initialize();
    const lockHandle = await this.acquireLock();
    try {
      return await operation();
    } finally {
      await lockHandle.close().catch(() => undefined);
      await unlink(this.lockPath).catch(() => undefined);
    }
  }

  async read(keyHash: string): Promise<IdempotencyLedgerRecord | null> {
    this.validateHash(keyHash);
    const path = this.recordPath(keyHash);
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as PersistedRecord;
      if (
        parsed.version !== 1
        || parsed.record.keyHash !== keyHash
        || parsed.checksum !== checksum(parsed.record)
      ) {
        writeDisabled("The create_task idempotency ledger failed integrity validation.");
      }
      return parsed.record;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      if (error instanceof CreateTaskOperationError) throw error;
      writeDisabled("The create_task idempotency ledger could not be read safely.");
    }
  }

  async reserve(keyHash: string, payloadHash: string): Promise<IdempotencyLedgerRecord> {
    const existing = await this.read(keyHash);
    if (existing !== null) return existing;
    const timestamp = this.now().toISOString();
    const record: IdempotencyLedgerRecord = {
      keyHash,
      payloadHash,
      state: "reserved",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.write(record);
    return record;
  }

  async transition(
    keyHash: string,
    nextState: CreateTaskLedgerState,
    update: Pick<IdempotencyLedgerRecord, "taskId" | "resultCode" | "replayUntil"> = {},
  ): Promise<IdempotencyLedgerRecord> {
    const current = await this.read(keyHash);
    if (current === null) writeDisabled("The create_task ledger record is missing.");
    if (!ALLOWED_TRANSITIONS[current.state].includes(nextState)) {
      writeDisabled(`Invalid create_task ledger transition ${current.state} -> ${nextState}.`);
    }
    if (["task_created", "verified", "verification_failed"].includes(nextState) && !update.taskId && !current.taskId) {
      writeDisabled(`Ledger state ${nextState} requires a taskId.`);
    }
    const next: IdempotencyLedgerRecord = {
      ...current,
      ...update,
      state: nextState,
      updatedAt: this.now().toISOString(),
    };
    await this.write(next);
    return next;
  }

  private async write(record: IdempotencyLedgerRecord): Promise<void> {
    this.validateHash(record.keyHash);
    const target = this.recordPath(record.keyHash);
    const temporary = `${target}.${randomUUID()}.tmp`;
    const persisted: PersistedRecord = { version: 1, record, checksum: checksum(record) };
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(persisted), "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, target);
    await chmod(target, 0o600);
    const directory = await open(this.recordsDirectory, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  private async acquireLock() {
    const deadline = Date.now() + this.lockTimeoutMs;
    while (true) {
      try {
        const handle = await open(this.lockPath, "wx", 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, createdAt: this.now().toISOString() }), "utf8");
        await handle.sync();
        return handle;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          writeDisabled("The create_task global mutation lock could not be acquired.");
        }
        await this.recoverStaleLock();
        if (Date.now() >= deadline) {
          throw new CreateTaskOperationError({
            code: "duplicate_request",
            message: "Another create_task mutation is currently in progress.",
            mayHaveWritten: false,
            retrySafe: false,
            reason: "in_progress",
          });
        }
        await delay(this.pollIntervalMs);
      }
    }
  }

  private async recoverStaleLock(): Promise<void> {
    try {
      const lockStat = await stat(this.lockPath);
      if (Date.now() - lockStat.mtimeMs < this.staleLockMs) return;
      const raw = await readFile(this.lockPath, "utf8");
      const parsed = JSON.parse(raw) as { pid?: unknown };
      if (typeof parsed.pid !== "number" || this.processExists(parsed.pid)) return;
      await unlink(this.lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
    }
  }

  private processExists(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "EPERM";
    }
  }

  private recordPath(keyHash: string): string {
    return join(this.recordsDirectory, `${keyHash}.json`);
  }

  private validateHash(value: string): void {
    if (!/^[a-f0-9]{64}$/.test(value)) writeDisabled("Invalid create_task ledger key hash.");
  }
}
