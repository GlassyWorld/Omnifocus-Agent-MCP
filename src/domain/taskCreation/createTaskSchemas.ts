import { z } from "zod";

export const CREATE_TASK_FINGERPRINT_NAMESPACE = "create_task:v1";

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
  idempotencyKey: z.string().uuid().optional(),
} as const;

export const createTaskInputSchema = z.object(createTaskInputShape)
  .strict()
  .superRefine((value, context) => {
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
  });

export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export interface CanonicalCreateTaskPayload {
  name: string;
  note: string;
  plannedDate: string | null;
  dueDate: string | null;
  deferDate: string | null;
  flagged: boolean;
  estimatedMinutes: number | null;
}

export const createdTaskViewSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  note: z.string(),
  location: z.object({ kind: z.literal("inbox") }).strict(),
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
