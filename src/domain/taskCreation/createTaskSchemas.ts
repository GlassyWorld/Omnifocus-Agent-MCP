import { z } from "zod";
import { nonEmptyStringSchema } from "../domainSchemas.js";

export const CREATE_TASK_FINGERPRINT_NAMESPACE = "create_task:v2";
export const canonicalOmniFocusIdSchema = nonEmptyStringSchema;

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return true;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

export const createTaskAbsoluteDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .refine(value => /(?:Z|[+-]\d{2}:\d{2})$/.test(value), {
    message: "datetime must include Z or an explicit UTC offset",
  });

const createTaskIdempotencyKeySchema = z.string().uuid();

export const createTaskInputShape = {
  name: z.string().trim().min(1).max(500).refine(value => !hasLoneSurrogate(value), {
    message: "name must contain well-formed Unicode",
  }),
  note: z.string().max(20_000).refine(value => !hasLoneSurrogate(value), {
    message: "note must contain well-formed Unicode",
  }).optional(),
  plannedDate: createTaskAbsoluteDateTimeSchema.optional(),
  dueDate: createTaskAbsoluteDateTimeSchema.optional(),
  deferDate: createTaskAbsoluteDateTimeSchema.optional(),
  flagged: z.boolean().optional(),
  estimatedMinutes: z.number().int().positive().max(10_080).optional(),
  destination: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("inbox") }).strict(),
    z.object({
      kind: z.literal("project"),
      projectId: canonicalOmniFocusIdSchema,
    }).strict(),
  ]),
  idempotencyKey: createTaskIdempotencyKeySchema.optional(),
} as const;

export const createTaskPublicInputShape = {
  ...createTaskInputShape,
  idempotencyKey: createTaskIdempotencyKeySchema,
} as const;

function validateDateRelationships(
  value: { deferDate?: string; dueDate?: string },
  context: z.RefinementCtx,
): void {
  if (
    value.deferDate !== undefined
    && value.dueDate !== undefined
    && Date.parse(value.dueDate) < Date.parse(value.deferDate)
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["dueDate"],
      message: "dueDate must not be earlier than deferDate",
    });
  }
}

export const createTaskInputSchema = z.object(createTaskInputShape)
  .strict()
  .superRefine(validateDateRelationships);

// The current production client has no verified stable MCP request-ID source.
// Keep the public Tool contract fail-closed by requiring a client/model UUID.
// The internal schema remains optional so a future, separately accepted stable
// metadata path can be enabled without changing Ledger semantics.
export const createTaskPublicInputSchema = z.object(createTaskPublicInputShape)
  .strict()
  .superRefine(validateDateRelationships);

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export interface CanonicalCreateTaskPayloadV2 {
  name: string;
  note: string;
  plannedDate: string | null;
  dueDate: string | null;
  deferDate: string | null;
  flagged: boolean;
  estimatedMinutes: number | null;
  destination:
    | { kind: "inbox" }
    | { kind: "project"; projectId: string };
}

export const createdTaskLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inbox") }).strict(),
  z.object({
    kind: z.literal("project"),
    projectId: canonicalOmniFocusIdSchema,
    projectName: z.string(),
  }).strict(),
]);

export const createdTaskViewSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  note: z.string(),
  location: createdTaskLocationSchema,
  plannedDate: createTaskAbsoluteDateTimeSchema.nullable(),
  dueDate: createTaskAbsoluteDateTimeSchema.nullable(),
  deferDate: createTaskAbsoluteDateTimeSchema.nullable(),
  flagged: z.boolean(),
  estimatedMinutes: z.number().int().nullable(),
}).strict();

export type CreatedTaskView = z.infer<typeof createdTaskViewSchema>;

export const createTaskWarningSchema = z.object({
  code: z.enum([
    "planned_before_defer",
      "planned_after_due",
      "replayed_current_state_changed",
      "project_state_changed_after_creation",
      "project_state_unverified_after_creation",
  ]),
  message: z.string(),
}).strict();

export type CreateTaskWarning = z.infer<typeof createTaskWarningSchema>;

export const createTaskSuccessSchema = z.object({
  success: z.literal(true),
  created: createdTaskViewSchema,
  idempotency: z.object({
    key: z.string().min(1).max(200),
    replayed: z.boolean(),
    replayUntil: createTaskAbsoluteDateTimeSchema,
  }).strict(),
  warnings: z.array(createTaskWarningSchema),
}).strict();

export const createTaskOutputSchema = createTaskSuccessSchema.shape;
export type CreateTaskSuccess = z.infer<typeof createTaskSuccessSchema>;

export const _testExports = { hasLoneSurrogate };
