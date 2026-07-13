import { appendFileSync, chmodSync, mkdirSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { z } from "zod";
import type { RequestHandlerExtra } from "../../types/sdkProtocolCompat.js";
import { CreateTaskOperationError, CreateTaskErrorResponse } from "../../domain/taskCreation/createTaskErrors.js";
import { CreateTaskLedger } from "../../domain/taskCreation/createTaskLedger.js";
import { CreateTaskService } from "../../domain/taskCreation/createTaskService.js";
import {
  createTaskInputSchema,
  createTaskPublicInputShape,
  createTaskOutputSchema,
  createTaskSuccessSchema,
} from "../../domain/taskCreation/createTaskSchemas.js";
import { createInboxTask } from "../primitives/createInboxTask.js";
import { getTask } from "../primitives/getTask.js";
import { isCreateTaskMutationEnabled } from "../../config/createTaskFeatureFlag.js";
import { canonicalizeCreateTaskInput } from "../../domain/taskCreation/createTaskCanonicalizer.js";
import { hashIdempotencyKey } from "../../domain/taskCreation/createTaskLedger.js";

// MCP SDK 1.29 serializes refined/effects schemas as an empty JSON Schema.
// Register a strict ZodObject so clients receive the complete properties and
// required list; the handler still runs the full relation-aware parser.
export const schema = z.object(createTaskPublicInputShape).strict();
export const inputSchema = schema;
export const outputSchema = createTaskOutputSchema;
export const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export interface CreateTaskHandlerService {
  execute(input: z.infer<typeof createTaskInputSchema>, effectiveKey: string): Promise<z.infer<typeof createTaskSuccessSchema>>;
}

export interface CreateTaskCanaryAuditRecord {
  correlationId: string;
  requestMetadataHash: string;
  argsIdempotencyKeyHash: string;
  effectiveKeyHash: string;
  resultCode: "write_disabled" | "success" | CreateTaskOperationError["detail"]["code"];
  elapsedMs: number;
}

export type CreateTaskCanaryAuditSink = (record: CreateTaskCanaryAuditRecord) => void;

const defaultAuditPath = join(
  homedir(),
  "Library",
  "Logs",
  "OmniFocus-MCP",
  "create-task-canary.jsonl",
);

function createFileCanaryAuditSink(filePath: string): CreateTaskCanaryAuditSink {
  return record => {
    const directory = dirname(filePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    appendFileSync(filePath, `${JSON.stringify(record)}\n`, { encoding: "utf8", mode: 0o600 });
    chmodSync(filePath, 0o600);
  };
}

const defaultAuditSink = createFileCanaryAuditSink(defaultAuditPath);

function defaultService(): CreateTaskHandlerService {
  return new CreateTaskService({
    ledger: new CreateTaskLedger({
      stateDirectory: join(homedir(), "Library", "Application Support", "OmniFocus-MCP", "create-task-v1"),
    }),
    createInboxTask,
    readTaskById: taskId => getTask({ id: taskId }),
  });
}

function resolveEffectiveKey(
  inputKey: string | undefined,
  extra: Pick<RequestHandlerExtra, "requestId">,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.OMNIFOCUS_MCP_STABLE_REQUEST_ID === "true") {
    const requestId = String(extra.requestId);
    if (requestId.length > 0 && requestId.length <= 180) return `mcp:${requestId}`;
  }
  return inputKey ?? null;
}

export async function handler(
  args: z.infer<typeof schema>,
  extra: RequestHandlerExtra,
  service?: CreateTaskHandlerService,
  env: NodeJS.ProcessEnv = process.env,
  auditSink: CreateTaskCanaryAuditSink = defaultAuditSink,
) {
  const startedAt = Date.now();
  const parsed = createTaskInputSchema.safeParse(args);
  if (!parsed.success) {
    return errorResponse(new CreateTaskOperationError({
      code: "invalid_arguments",
      message: "The create_task arguments do not satisfy the strict V1 contract.",
      mayHaveWritten: false,
      retrySafe: false,
    }));
  }
  const effectiveKey = resolveEffectiveKey(parsed.data.idempotencyKey, extra);
  if (effectiveKey === null) {
    return errorResponse(new CreateTaskOperationError({
      code: "invalid_arguments",
      message: "A stable idempotency key is required before create_task can write.",
      mayHaveWritten: false,
      retrySafe: false,
    }));
  }

  // Preserve the same semantic normalization boundary in disabled and enabled
  // Canary runs without retaining or logging the payload.
  canonicalizeCreateTaskInput(parsed.data);
  const canaryMetadata = {
    requestMetadataHash: hashIdempotencyKey(String(extra.requestId)),
    argsIdempotencyKeyHash: hashIdempotencyKey(parsed.data.idempotencyKey!),
    effectiveKeyHash: hashIdempotencyKey(effectiveKey),
  };

  if (!isCreateTaskMutationEnabled(env)) {
    emitCanaryAudit(auditSink, canaryMetadata, "write_disabled", startedAt);
    return errorResponse(new CreateTaskOperationError({
      code: "write_disabled",
      message: "create_task is registered for canary validation but mutation is disabled.",
      mayHaveWritten: false,
      retrySafe: false,
    }));
  }

  try {
    const activeService = service ?? defaultService();
    const result = createTaskSuccessSchema.parse(
      await activeService.execute(parsed.data, effectiveKey),
    );
    emitCanaryAudit(auditSink, canaryMetadata, "success", startedAt);
    return {
      structuredContent: result,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    if (error instanceof CreateTaskOperationError) {
      emitCanaryAudit(auditSink, canaryMetadata, error.detail.code, startedAt);
      return errorResponse(error);
    }
    const operationError = new CreateTaskOperationError({
      code: "internal_error",
      message: "create_task failed before a trustworthy result was available.",
      mayHaveWritten: true,
      retrySafe: false,
    });
    emitCanaryAudit(auditSink, canaryMetadata, operationError.detail.code, startedAt);
    return errorResponse(operationError);
  }
}

function emitCanaryAudit(
  auditSink: CreateTaskCanaryAuditSink,
  metadata: Pick<CreateTaskCanaryAuditRecord, "requestMetadataHash" | "argsIdempotencyKeyHash" | "effectiveKeyHash">,
  resultCode: CreateTaskCanaryAuditRecord["resultCode"],
  startedAt: number,
) {
  const correlationId = `ct-${metadata.requestMetadataHash.slice(0, 12)}`;
  const record: CreateTaskCanaryAuditRecord = {
    correlationId,
    ...metadata,
    resultCode,
    elapsedMs: Math.max(0, Date.now() - startedAt),
  };
  try {
    auditSink(record);
  } catch {
    // Audit transport failure must not alter the Tool result. The same
    // privacy-safe record is emitted to stderr as a best-effort fallback.
    console.error(JSON.stringify(record));
  }
}

function errorResponse(error: CreateTaskOperationError) {
  const payload: CreateTaskErrorResponse = { success: false, error: error.detail };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

export const _testExports = {
  createFileCanaryAuditSink,
  defaultAuditPath,
  resolveEffectiveKey,
  emitCanaryAudit,
  errorResponse,
};
