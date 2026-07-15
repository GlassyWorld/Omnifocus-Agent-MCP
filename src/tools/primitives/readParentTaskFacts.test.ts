import { mkdtemp, readFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { readParentTaskFactsById, type ParentFactsReadRunner } from "./readParentTaskFacts.js";

const facts = {
  id: "parent-1",
  name: "Parent",
  kind: "action_group",
  taskStatus: "Available",
  completion: { direct: false, effectiveDate: null },
  drop: { direct: false, effectiveDate: null },
  project: { id: "project-1", name: "Project", status: "Active" },
  folderChain: [{ id: "folder-1", name: "Folder", status: "Active" }],
  parentChain: [{
    id: "project-1",
    kind: "project_root",
    taskStatus: "Available",
    completion: { direct: false, effectiveDate: null },
    drop: { direct: false, effectiveDate: null },
  }],
};

describe("readParentTaskFactsById", () => {
  it("uses a 0600 payload file and accepts an exact bounded facts envelope", async () => {
    const directory = await mkdtemp(join(tmpdir(), "parent-facts-reader-"));
    const runner: ParentFactsReadRunner = async (_executable, args) => {
      const payloadPath = args[3];
      expect(JSON.parse(await readFile(payloadPath, "utf8"))).toEqual({ parentTaskId: "parent-1" });
      expect((await stat(payloadPath)).mode & 0o777).toBe(0o600);
      return { stdout: JSON.stringify({ success: true, facts }), stderr: "" };
    };
    await expect(readParentTaskFactsById("parent-1", {
      temporaryDirectory: directory,
      runner,
    })).resolves.toEqual({ success: true, facts });
  });

  it("preserves trusted native read failures", async () => {
    await expect(readParentTaskFactsById("parent-1", {
      runner: async () => ({
        stdout: JSON.stringify({ success: false, reason: "orphan_parent" }),
        stderr: "",
      }),
    })).resolves.toEqual({ success: false, reason: "orphan_parent" });
  });

  it("returns readable completed and dropped facts without applying eligibility", async () => {
    for (const inactiveFacts of [
      {
        ...facts,
        taskStatus: "Completed",
        completion: { direct: true, effectiveDate: "2026-07-15T00:00:00.000Z" },
      },
      {
        ...facts,
        taskStatus: "Dropped",
        drop: { direct: true, effectiveDate: "2026-07-15T00:00:00.000Z" },
      },
    ]) {
      await expect(readParentTaskFactsById("parent-1", {
        runner: async () => ({
          stdout: JSON.stringify({ success: true, facts: inactiveFacts }),
          stderr: "",
        }),
      })).resolves.toEqual({ success: true, facts: inactiveFacts });
    }
  });

  it("maps process failure to the only retryable read reason", async () => {
    await expect(readParentTaskFactsById("parent-1", {
      runner: async () => { throw new Error("process failed"); },
    })).resolves.toEqual({ success: false, reason: "query_failed" });
  });

  it("fails closed on adapter drift or ID mismatch", async () => {
    await expect(readParentTaskFactsById("parent-1", {
      runner: async () => ({ stdout: "{}", stderr: "" }),
    })).resolves.toEqual({ success: false, reason: "adapter_failed" });
    await expect(readParentTaskFactsById("parent-1", {
      runner: async () => ({ stdout: "not-json", stderr: "" }),
    })).resolves.toEqual({ success: false, reason: "adapter_failed" });
    await expect(readParentTaskFactsById("parent-1", {
      runner: async () => ({
        stdout: JSON.stringify({ success: true, facts: { ...facts, id: "other" } }),
        stderr: "",
      }),
    })).resolves.toEqual({ success: false, reason: "canonical_id_mismatch" });
  });

  it("rejects malformed input before starting a process", async () => {
    let calls = 0;
    expect(await readParentTaskFactsById("", {
      runner: async () => {
        calls += 1;
        return { stdout: "", stderr: "" };
      },
    })).toEqual({ success: false, reason: "malformed_id" });
    expect(calls).toBe(0);
  });
});
