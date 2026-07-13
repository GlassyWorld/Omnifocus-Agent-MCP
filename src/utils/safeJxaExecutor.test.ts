import { access, mkdtemp, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateTaskOperationError } from "../domain/taskCreation/createTaskErrors.js";
import { SafeJxaExecutor, SafeProcessRunner } from "./safeJxaExecutor.js";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "safe-jxa-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("SafeJxaExecutor", () => {
  it("uses execFile-style argv, a 0600 payload file, and removes it", async () => {
    let payloadPath = "";
    const runner = vi.fn<SafeProcessRunner>(async (executable, args) => {
      expect(executable).toBe("/usr/bin/osascript");
      expect(args.slice(0, 3)).toEqual(["-l", "JavaScript", "/safe/script.js"]);
      payloadPath = args[3];
      expect((await stat(payloadPath)).mode & 0o777).toBe(0o600);
      return { stdout: '{"success":true}', stderr: "private stderr is ignored" };
    });
    const executor = new SafeJxaExecutor({ temporaryDirectory: directory, runner });
    await expect(executor.execute("/safe/script.js", { name: "private task" }))
      .resolves.toEqual({ success: true });
    await expect(access(payloadPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each([
    ["", "empty_stdout"],
    ["not-json", "invalid_json_stdout"],
    ['{"ok":true}\nnoise', "invalid_json_stdout"],
  ])("fails closed for untrusted stdout", async (stdout, reason) => {
    const executor = new SafeJxaExecutor({
      temporaryDirectory: directory,
      runner: async () => ({ stdout, stderr: "" }),
    });
    try {
      await executor.execute("/safe/script.js", {});
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(CreateTaskOperationError);
      expect((error as CreateTaskOperationError).detail).toMatchObject({
        code: "verification_failed",
        mayHaveWritten: true,
        retrySafe: false,
        reason,
      });
    }
  });

  it("does not expose process errors or payload content", async () => {
    const executor = new SafeJxaExecutor({
      temporaryDirectory: directory,
      runner: async () => {
        throw new Error("private task name and note");
      },
    });
    await expect(executor.execute("/safe/script.js", { name: "private task name" }))
      .rejects.toSatisfy((error: CreateTaskOperationError) => {
        expect(error.message).not.toContain("private");
        expect(JSON.stringify(error.detail)).not.toContain("private");
        return true;
      });
  });
});
