import { describe, expect, it } from "vitest";
import { CreateTaskOperationError } from "../domain/taskCreation/createTaskErrors.js";
import {
  AllowedTestDatabaseIdentity,
  assertMutationTestSafety,
  DatabaseIdentity,
} from "./mutationTestSafety.js";

const sentinel = { kind: "project" as const, id: "sentinel-1", name: "TEST DATABASE SENTINEL" };
const allowed: AllowedTestDatabaseIdentity = {
  configurationName: "isolated-test",
  documentName: "OmniFocus-TEST",
  stableId: "db-test-1",
  sentinel,
};
const actual: DatabaseIdentity = {
  documentName: "OmniFocus-TEST",
  fileUrl: null,
  stableId: "db-test-1",
  sentinel,
};

function invoke(overrides: Partial<Parameters<typeof assertMutationTestSafety>[0]> = {}) {
  return () => assertMutationTestSafety({
    env: {
      OMNIFOCUS_TEST_MODE: "true",
      OMNIFOCUS_TEST_DATABASE: "isolated-test",
    },
    actual,
    allowlist: [allowed],
    taskName: "TEST:run-1:task",
    runId: "run-1",
    ...overrides,
  });
}

describe("mutation integration safety guard", () => {
  it("accepts the complete compound identity", () => {
    expect(invoke()).not.toThrow();
  });

  it.each([
    [{ OMNIFOCUS_TEST_MODE: "false", OMNIFOCUS_TEST_DATABASE: "isolated-test" }, "safety_guard_failed"],
    [{ OMNIFOCUS_TEST_MODE: "true", OMNIFOCUS_TEST_DATABASE: "unknown" }, "test_environment_mismatch"],
  ] as const)("fails closed for environment mismatch", (env, code) => {
    try {
      invoke({ env })();
      throw new Error("expected guard to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CreateTaskOperationError);
      expect((error as CreateTaskOperationError).detail.code).toBe(code);
    }
  });

  it("rejects a stable identity mismatch", () => {
    expect(invoke({ actual: { ...actual, stableId: "production" } })).toThrow(
      "stable ID does not match",
    );
  });

  it("rejects a missing or wrong sentinel", () => {
    expect(invoke({ actual: { ...actual, sentinel: null } })).toThrow("sentinel");
  });

  it("rejects names outside the current run prefix", () => {
    expect(invoke({ taskName: "TEST:other:task" })).toThrow("TEST:run-1:");
  });

  it("rejects allowlist entries based only on a mutable name", () => {
    expect(invoke({
      allowlist: [{
        configurationName: "isolated-test",
        documentName: "OmniFocus-TEST",
        sentinel,
      }],
    })).toThrow("stable ID or file URL");
  });
});
