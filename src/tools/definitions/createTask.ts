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
  createTaskSuccessSchema,
} from "../../domain/taskCreation/createTaskSchemas.js";
import { CreateTaggedTaskService } from "../../domain/taskCreation/createTaggedTaskService.js";
import {
  createTaskInputSchemaV3,
  createTaskOutputSchemaV3,
  createTaskPublicInputShapeV3,
  hasTagAssignment,
  taggedCreateTaskSuccessSchema,
  type CreateTaskInputV3,
  type TaggedCreateTaskSuccess,
} from "../../domain/taskCreation/createTaskTagSchemas.js";
import { createInboxTask } from "../primitives/createInboxTask.js";
import { createTaskInProject } from "../primitives/createTaskInProject.js";
import { getTask } from "../primitives/getTask.js";
import { createTaggedTask } from "../primitives/createTaggedTask.js";
import { readCreatedTaskForVerification } from "../primitives/readCreatedTaskForVerification.js";
import { isCreateTaskMutationEnabled } from "../../config/createTaskFeatureFlag.js";
import { isCreateTaskProjectPlacementEnabled } from "../../config/createTaskProjectFeatureFlag.js";
import { isCreateTaskTagAssignmentEnabled } from "../../config/createTaskTagsFeatureFlag.js";
import {
  canonicalizeCreateTaskInput,
  canonicalizeTaggedCreateTaskInput,
} from "../../domain/taskCreation/createTaskCanonicalizer.js";
import { hashIdempotencyKey } from "../../domain/taskCreation/createTaskLedger.js";
import { resolveProjectById } from "../../domain/taskCreation/projectDestination.js";

// MCP SDK 1.29 serializes refined/effects schemas as an empty JSON Schema.
// Register a strict ZodObject so clients receive the complete properties and
// required list; the handler still runs the full relation-aware parser.
export const schema = z.object(createTaskPublicInputShapeV3).strict();
export const inputSchema = schema;
export const outputSchema = createTaskOutputSchemaV3;
export const annotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

export interface CreateTaskHandlerService {
  execute(
    input: CreateTaskInputV3,
    effectiveKey: string,
  ): Promise<z.infer<typeof createTaskSuccessSchema> | TaggedCreateTaskSuccess>;
}

export interface CreateTaskCanaryAuditRecord {
  correlationId: string;
  requestMetadataHash: string;
  argsIdempotencyKeyHash: string;
  effectiveKeyHash: string;
  resultCode: string;
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
  const ledger = new CreateTaskLedger({
    stateDirectory: join(homedir(), "Library", "Application Support", "OmniFocus-MCP", "create-task-v1"),
  });
  const noTagService = new CreateTaskService({
    ledger,
    createInboxTask,
    createTaskInProject,
    resolveProjectById,
    readTaskById: taskId => getTask({ id: taskId }),
  });
  const taggedService = new CreateTaggedTaskService({
    ledger,
    createTaggedTask,
    resolveProjectById,
    readCreatedTaskForVerification,
  });
  return {
    execute(input, effectiveKey) {
      if (hasTagAssignment(input)) {
        return taggedService.execute(input, effectiveKey);
      }
      return noTagService.execute(createTaskInputSchema.parse(input), effectiveKey);
    },
  };
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
  const parsed = createTaskInputSchemaV3.safeParse(args);
  if (!parsed.success) {
    return errorResponse(new CreateTaskOperationError({
      code: "invalid_arguments",
      message: "The create_task arguments do not satisfy the strict V3 contract.",
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
  if (hasTagAssignment(parsed.data)) {
    canonicalizeTaggedCreateTaskInput(parsed.data);
  } else {
    canonicalizeCreateTaskInput(createTaskInputSchema.parse(parsed.data));
  }
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

  if (
    parsed.data.destination.kind === "project"
    && !isCreateTaskProjectPlacementEnabled(env)
  ) {
    emitCanaryAudit(auditSink, canaryMetadata, "write_disabled", startedAt);
    return errorResponse(new CreateTaskOperationError({
      code: "write_disabled",
      message: "Project placement is registered for canary validation but mutation is disabled.",
      mayHaveWritten: false,
      retrySafe: false,
      reason: "project_placement_disabled",
    }));
  }

  if (
    hasTagAssignment(parsed.data)
    && !isCreateTaskTagAssignmentEnabled(env)
  ) {
    emitCanaryAudit(
      auditSink,
      canaryMetadata,
      "write_disabled.tag_assignment_disabled",
      startedAt,
    );
    return errorResponse(new CreateTaskOperationError({
      code: "write_disabled",
      message: "Tag assignment is registered for canary validation but mutation is disabled.",
      mayHaveWritten: false,
      retrySafe: false,
      reason: "tag_assignment_disabled",
    }));
  }

  try {
    const activeService = service ?? defaultService();
    const rawResult = await activeService.execute(parsed.data, effectiveKey);
    const result = hasTagAssignment(parsed.data)
      ? taggedCreateTaskSuccessSchema.parse(rawResult)
      : createTaskSuccessSchema.parse(rawResult);
    emitCanaryAudit(auditSink, canaryMetadata, "success", startedAt);
    return {
      structuredContent: result,
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    if (error instanceof CreateTaskOperationError) {
      emitCanaryAudit(
        auditSink,
        canaryMetadata,
        error.detail.reason ? `${error.detail.code}.${error.detail.reason}` : error.detail.code,
        startedAt,
      );
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
