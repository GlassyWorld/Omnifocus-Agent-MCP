import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";
import { CanonicalCreateTaskPayload } from "../../domain/taskCreation/createTaskSchemas.js";
import { SafeJxaExecutor } from "../../utils/safeJxaExecutor.js";

export type CreateInboxTaskResult =
  | { success: true; taskId: string }
  | {
      success: false;
      phase: "prewrite" | "postcreate" | "unknown";
      taskId?: string;
      errorCategory: string;
    };

export interface JxaJsonExecutor {
  execute(scriptPath: string, payload: unknown): Promise<unknown>;
}

const resultSchema = z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), taskId: z.string().min(1) }).strict(),
  z.object({
    success: z.literal(false),
    phase: z.enum(["prewrite", "postcreate", "unknown"]),
    taskId: z.string().min(1).nullable().optional(),
    errorCategory: z.string().min(1),
  }).strict(),
]);

function toEpochMilliseconds(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

function scriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "utils", "omnifocusScripts", "createInboxTask.js");
}

export async function createInboxTask(
  payload: CanonicalCreateTaskPayload,
  executor: JxaJsonExecutor = new SafeJxaExecutor(),
): Promise<CreateInboxTaskResult> {
  try {
    const raw = await executor.execute(scriptPath(), {
      name: payload.name,
      note: payload.note,
      plannedDateEpochMs: toEpochMilliseconds(payload.plannedDate),
      dueDateEpochMs: toEpochMilliseconds(payload.dueDate),
      deferDateEpochMs: toEpochMilliseconds(payload.deferDate),
      flagged: payload.flagged,
      estimatedMinutes: payload.estimatedMinutes,
    });
    const result = resultSchema.parse(raw);
    if (result.success) return result;
    return {
      success: false,
      phase: result.phase,
      taskId: result.taskId ?? undefined,
      errorCategory: result.errorCategory,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, phase: "unknown", errorCategory: "malformed_process_result" };
    }
    throw error;
  }
}

export const _testExports = { toEpochMilliseconds, scriptPath, resultSchema };
