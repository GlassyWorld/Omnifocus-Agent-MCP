import { z } from "zod";
import {
  canonicalOmniFocusIdSchema,
  createTaskSuccessSchema,
  createdTaskLocationSchema,
  createTaskInputShape,
  createdTaskViewSchema,
  validateDateRelationships,
  type CanonicalCreateTaskPayloadV2,
  type CreateTaskWarning,
} from "./createTaskSchemas.js";
import {
  createTaskInputShapeV3,
  createTaskPublicCreatedTaskViewSchemaV3,
  createTaskPublicInputShapeV3,
  createTaskPublicSuccessSchemaV3,
  tagIdsWireSchema,
} from "./createTaskTagSchemas.js";

export const createTaskDestinationSchemaV4 = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inbox") }).strict(),
  z.object({
    kind: z.literal("project"),
    projectId: canonicalOmniFocusIdSchema,
  }).strict(),
  z.object({
    kind: z.literal("parentTask"),
    parentTaskId: canonicalOmniFocusIdSchema,
  }).strict(),
]);

export const createTaskInputShapeV4 = {
  ...createTaskInputShapeV3,
  destination: createTaskDestinationSchemaV4,
} as const;

export const createTaskPublicInputShapeV4 = {
  ...createTaskPublicInputShapeV3,
  destination: createTaskDestinationSchemaV4,
} as const;

function validateV4Relations(
  value: { deferDate?: string; dueDate?: string; tagIds?: string[] },
  context: z.RefinementCtx,
): void {
  validateDateRelationships(value, context);
  if (value.tagIds !== undefined && new Set(value.tagIds).size !== value.tagIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tagIds"],
      message: "tagIds must be unique",
    });
  }
}

export const createTaskInputSchemaV4 = z.object(createTaskInputShapeV4)
  .strict()
  .superRefine(validateV4Relations);

export const createTaskPublicInputSchemaV4 = z.object(createTaskPublicInputShapeV4)
  .strict()
  .superRefine(validateV4Relations);

export type CreateTaskInputV4 = z.infer<typeof createTaskInputSchemaV4>;

const parentTaskDestinationSchema = z.object({
  kind: z.literal("parentTask"),
  parentTaskId: z.string().min(1),
}).strict();

export const parentCreateTaskInputSchema = z.object({
  ...createTaskInputShape,
  destination: parentTaskDestinationSchema,
  tagIds: tagIdsWireSchema.optional(),
}).strict().superRefine((value, context) => {
  validateDateRelationships(value, context);
  if (value.tagIds !== undefined && new Set(value.tagIds).size !== value.tagIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tagIds"],
      message: "tagIds must be unique",
    });
  }
});

export type ParentCreateTaskInput = z.infer<typeof parentCreateTaskInputSchema>;

export function hasParentDestination(
  input: CreateTaskInputV4,
): input is CreateTaskInputV4 & {
  destination: { kind: "parentTask"; parentTaskId: string };
} {
  return input.destination.kind === "parentTask";
}

export interface CanonicalParentCreateTaskPayload
  extends Omit<CanonicalCreateTaskPayloadV2, "destination"> {
  destination: { kind: "parentTask"; parentTaskId: string };
  tagIds: string[];
}

export const ordinaryParentTaskLocationSchema = z.object({
    kind: z.literal("parentTask"),
    parentTaskId: z.string().min(1),
    parentTaskName: z.string(),
    projectId: z.string().min(1).nullable(),
    projectName: z.string().nullable(),
  }).strict().superRefine((value, context) => {
    if ((value.projectId === null) !== (value.projectName === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectId"],
        message: "projectId and projectName must either both be null or both be present",
      });
    }
  });

export const parentCreatedTaskLocationSchema = z.union([
  createdTaskLocationSchema,
  ordinaryParentTaskLocationSchema,
]);

export const parentCreatedTaskViewSchema = createdTaskViewSchema
  .omit({ location: true })
  .extend({
    location: parentCreatedTaskLocationSchema,
    tagIds: z.array(z.string().min(1)).max(5).optional(),
  })
  .strict();

export type ParentCreatedTaskView = z.infer<typeof parentCreatedTaskViewSchema>;

export const parentCreateTaskWarningSchema = z.object({
  code: z.enum([
    "planned_before_defer",
    "planned_after_due",
    "replayed_current_state_changed",
    "project_state_changed_after_creation",
    "project_state_unverified_after_creation",
    "parent_state_changed_after_creation",
    "parent_state_unverified_after_creation",
  ]),
  message: z.string(),
}).strict();

const parentCreatedTaskWithoutTagsSchema = parentCreatedTaskViewSchema.omit({
  tagIds: true,
});

const uniqueParentTagIdsSchema = tagIdsWireSchema.refine(
  values => new Set(values).size === values.length,
  { message: "tagIds must be unique" },
);

const taggedParentCreatedTaskViewSchema = parentCreatedTaskWithoutTagsSchema.extend({
  tagIds: uniqueParentTagIdsSchema,
}).strict();

export const parentCreateTaskSuccessWithoutTagsSchema = createTaskSuccessSchema.extend({
  created: parentCreatedTaskWithoutTagsSchema,
  warnings: z.array(parentCreateTaskWarningSchema),
}).strict();

export const taggedParentCreateTaskSuccessSchema = createTaskSuccessSchema.extend({
  created: taggedParentCreatedTaskViewSchema,
  warnings: z.array(parentCreateTaskWarningSchema),
}).strict();

export const createTaskPublicCreatedTaskViewSchemaV4 =
  createTaskPublicCreatedTaskViewSchemaV3
    .omit({ location: true })
    .extend({
      location: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("inbox") }).strict(),
        z.object({
          kind: z.literal("project"),
          projectId: canonicalOmniFocusIdSchema,
          projectName: z.string(),
        }).strict(),
        z.object({
          kind: z.literal("parentTask"),
          parentTaskId: canonicalOmniFocusIdSchema,
          parentTaskName: z.string(),
          projectId: canonicalOmniFocusIdSchema.nullable(),
          projectName: z.string().nullable(),
        }).strict(),
      ]),
    })
    .strict();

export const createTaskPublicSuccessSchemaV4 = createTaskPublicSuccessSchemaV3.extend({
  created: createTaskPublicCreatedTaskViewSchemaV4,
  warnings: z.array(parentCreateTaskWarningSchema),
}).strict();

export const createTaskOutputSchemaV4 = createTaskPublicSuccessSchemaV4.shape;

export type ParentCreateTaskWarning = CreateTaskWarning | {
  code:
    | "parent_state_changed_after_creation"
    | "parent_state_unverified_after_creation";
  message: string;
};

export interface ParentCreateTaskSuccess {
  success: true;
  created: ParentCreatedTaskView;
  idempotency: {
    key: string;
    replayed: boolean;
    replayUntil: string;
  };
  warnings: ParentCreateTaskWarning[];
}
