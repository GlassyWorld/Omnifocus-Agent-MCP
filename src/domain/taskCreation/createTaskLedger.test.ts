import { mkdtemp, readFile, rm, utimes, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CreateTaskOperationError } from "./createTaskErrors.js";
import { CreateTaskLedger, hashIdempotencyKey } from "./createTaskLedger.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "create-task-ledger-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function ledger(options: Partial<ConstructorParameters<typeof CreateTaskLedger>[0]> = {}) {
  return new CreateTaskLedger({
    stateDirectory: directory,
    lockTimeoutMs: 100,
    pollIntervalMs: 5,
    staleLockMs: 50,
    ...options,
  });
}

describe("create_task durable idempotency ledger", () => {
  it("persists minimal state across instances", async () => {
    const keyHash = hashIdempotencyKey("key-1");
    const first = ledger();
    await first.initialize();
    await first.withGlobalLock(async () => {
      await first.reserve(keyHash, "a".repeat(64));
      await first.transition(keyHash, "write_started");
      await first.transition(keyHash, "task_created", { taskId: "task-1" });
      await first.transition(keyHash, "verified", {
        taskId: "task-1",
        resultCode: "success",
        replayUntil: "2026-07-14T00:00:00.000Z",
      });
    });

    const record = await ledger().read(keyHash);
    expect(record).toMatchObject({ state: "verified", taskId: "task-1" });
    const raw = await readFile(join(directory, "records", `${keyHash}.json`), "utf8");
    expect(raw).not.toContain("private task name");
    expect(raw).not.toContain("note");
    expect(raw).not.toContain("TaskView");
  });

  it("returns the existing tombstone instead of reserving again", async () => {
    const store = ledger();
    const keyHash = hashIdempotencyKey("same-key");
    await store.withGlobalLock(async () => {
      await store.reserve(keyHash, "a".repeat(64));
      await store.transition(keyHash, "terminal_prewrite_error", { resultCode: "write_failed" });
    });
    const again = await store.withGlobalLock(() => store.reserve(keyHash, "b".repeat(64)));
    expect(again.state).toBe("terminal_prewrite_error");
    expect(again.payloadHash).toBe("a".repeat(64));
  });

  it("serializes concurrent mutations with a global lock", async () => {
    const store = ledger({ lockTimeoutMs: 500 });
    let active = 0;
    let maximumActive = 0;
    const operation = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise(resolve => setTimeout(resolve, 30));
      active -= 1;
    };
    await Promise.all([
      store.withGlobalLock(operation),
      store.withGlobalLock(operation),
    ]);
    expect(maximumActive).toBe(1);
  });

  it("rejects invalid state transitions", async () => {
    const store = ledger();
    const keyHash = hashIdempotencyKey("key");
    await store.withGlobalLock(() => store.reserve(keyHash, "a".repeat(64)));
    await expect(store.withGlobalLock(() => store.transition(keyHash, "verified", { taskId: "task" })))
      .rejects.toMatchObject<CreateTaskOperationError>({ detail: { code: "write_disabled" } });
  });

  it("fails closed when a record is corrupted", async () => {
    const store = ledger();
    const keyHash = hashIdempotencyKey("key");
    await store.withGlobalLock(() => store.reserve(keyHash, "a".repeat(64)));
    await writeFile(join(directory, "records", `${keyHash}.json`), "{}", "utf8");
    await expect(store.read(keyHash)).rejects.toMatchObject<CreateTaskOperationError>({
      detail: { code: "write_disabled" },
    });
  });

  it("recovers a stale lock only when the owner no longer exists", async () => {
    const store = ledger({ staleLockMs: 1 });
    await store.initialize();
    const lockPath = join(directory, "mutation.lock");
    await writeFile(lockPath, JSON.stringify({ pid: 999_999_999 }), { mode: 0o600 });
    const old = new Date(Date.now() - 10_000);
    await utimes(lockPath, old, old);
    await expect(store.withGlobalLock(async () => "ok")).resolves.toBe("ok");
  });
});
