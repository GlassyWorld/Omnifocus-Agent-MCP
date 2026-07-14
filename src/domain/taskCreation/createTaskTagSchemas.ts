import { z } from "zod";
import {
  canonicalOmniFocusIdSchema,
  createTaskInputShape,
  createTaskPublicInputShape,
  createTaskSuccessSchema,
  createdTaskViewSchema,
  type CanonicalCreateTaskPayloadV2,
  validateDateRelationships,
} from "./createTaskSchemas.js";

export const tagIdsWireSchema = z
  .array(canonicalOmniFocusIdSchema)
  .min(1)
  .max(5)
  .describe(
    "1-5 unique canonical IDs of existing OmniFocus Tags; names, paths, and automatic Tag creation are not accepted.",
  );

export const createTaskInputShapeV3 = {
  ...createTaskInputShape,
  tagIds: tagIdsWireSchema.optional(),
} as const;

export const createTaskPublicInputShapeV3 = {
  ...createTaskPublicInputShape,
  tagIds: tagIdsWireSchema.optional(),
} as const;

function validateTagIdsUniqueness(
  value: { tagIds?: string[] },
  context: z.RefinementCtx,
): void {
  if (
    value.tagIds !== undefined
    && new Set(value.tagIds).size !== value.tagIds.length
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tagIds"],
      message: "tagIds must be unique",
    });
  }
}

function validateV3Relations(
  value: { deferDate?: string; dueDate?: string; tagIds?: string[] },
  context: z.RefinementCtx,
): void {
  validateDateRelationships(value, context);
  validateTagIdsUniqueness(value, context);
}

// T2-B internal-only. Do not export either shape through the registered MCP
// handler before the separately approved T2-C publication gate.
export const createTaskInputSchemaV3 = z.object(createTaskInputShapeV3)
  .strict()
  .superRefine(validateV3Relations);

export const createTaskPublicInputSchemaV3 = z.object(createTaskPublicInputShapeV3)
  .strict()
  .superRefine(validateV3Relations);

export interface CanonicalTaggedCreateTaskPayload
  extends CanonicalCreateTaskPayloadV2 {
  tagIds: string[];
}

export type CreateTaskInputV3 = z.infer<typeof createTaskInputSchemaV3>;
export type TaggedCreateTaskInput = CreateTaskInputV3 & { tagIds: string[] };

export function hasTagAssignment(
  input: CreateTaskInputV3,
): input is TaggedCreateTaskInput {
  return input.tagIds !== undefined;
}

const uniqueTagIdsSchema = tagIdsWireSchema.refine(
  values => new Set(values).size === values.length,
  { message: "tagIds must be unique" },
);

export const createTaskPublicCreatedTaskViewSchemaV3 = createdTaskViewSchema.extend({
  // Keep the published property as a plain optional ZodArray. The tagged
  // branch-specific parser below enforces presence and uniqueness at runtime.
  tagIds: tagIdsWireSchema.optional(),
}).strict();

export const createTaskPublicSuccessSchemaV3 = createTaskSuccessSchema.extend({
  created: createTaskPublicCreatedTaskViewSchemaV3,
}).strict();

export const createTaskOutputSchemaV3 = createTaskPublicSuccessSchemaV3.shape;

export const taggedCreatedTaskViewSchema = createdTaskViewSchema.extend({
  tagIds: uniqueTagIdsSchema,
}).strict();

export const taggedCreateTaskSuccessSchema = createTaskSuccessSchema.extend({
  created: taggedCreatedTaskViewSchema,
}).strict();

export type TaggedCreatedTaskView = z.infer<typeof taggedCreatedTaskViewSchema>;
export type TaggedCreateTaskSuccess = z.infer<typeof taggedCreateTaskSuccessSchema>;

export const _testExports = { validateTagIdsUniqueness, validateV3Relations };
