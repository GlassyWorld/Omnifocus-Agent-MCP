import { CreateTaskOperationError } from "../domain/taskCreation/createTaskErrors.js";

export interface DatabaseSentinelIdentity {
  kind: "project" | "folder" | "tag";
  id: string;
  name: string;
}

export interface DatabaseIdentity {
  documentName: string | null;
  fileUrl: string | null;
  stableId: string | null;
  sentinel: DatabaseSentinelIdentity | null;
}

export interface AllowedTestDatabaseIdentity {
  configurationName: string;
  documentName?: string;
  fileUrl?: string;
  stableId?: string;
  sentinel: DatabaseSentinelIdentity;
}

export interface MutationTestSafetyRequest {
  env: NodeJS.ProcessEnv;
  actual: DatabaseIdentity;
  allowlist: readonly AllowedTestDatabaseIdentity[];
  taskName: string;
  runId: string;
}

function mismatch(message: string): never {
  throw new CreateTaskOperationError({
    code: "test_environment_mismatch",
    message,
    mayHaveWritten: false,
    retrySafe: false,
  });
}

export function assertMutationTestSafety(request: MutationTestSafetyRequest): void {
  if (request.env.OMNIFOCUS_TEST_MODE !== "true") {
    throw new CreateTaskOperationError({
      code: "safety_guard_failed",
      message: "OMNIFOCUS_TEST_MODE must be exactly true before integration mutation.",
      mayHaveWritten: false,
      retrySafe: false,
    });
  }

  const configuredName = request.env.OMNIFOCUS_TEST_DATABASE;
  const expected = request.allowlist.find(item => item.configurationName === configuredName);
  if (!expected) mismatch("The configured test database is not in the code allowlist.");

  const stableIdentityConfigured = expected.stableId !== undefined || expected.fileUrl !== undefined;
  if (!stableIdentityConfigured) {
    mismatch("The allowlisted test database lacks a stable ID or file URL.");
  }
  if (expected.documentName !== undefined && request.actual.documentName !== expected.documentName) {
    mismatch("The actual mutation document name does not match the allowlist.");
  }
  if (expected.fileUrl !== undefined && request.actual.fileUrl !== expected.fileUrl) {
    mismatch("The actual mutation document file URL does not match the allowlist.");
  }
  if (expected.stableId !== undefined && request.actual.stableId !== expected.stableId) {
    mismatch("The actual mutation document stable ID does not match the allowlist.");
  }
  if (
    request.actual.sentinel === null
    || request.actual.sentinel.kind !== expected.sentinel.kind
    || request.actual.sentinel.id !== expected.sentinel.id
    || request.actual.sentinel.name !== expected.sentinel.name
  ) {
    mismatch("The pre-provisioned test database sentinel does not match the allowlist.");
  }

  const prefix = `TEST:${request.runId}:`;
  if (!request.taskName.startsWith(prefix)) {
    mismatch(`Integration task names must start with ${prefix}`);
  }
}
