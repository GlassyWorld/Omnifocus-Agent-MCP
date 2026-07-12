import { z } from 'zod';
import {
  nullableStringSchema,
  nonEmptyStringSchema,
  projectContextSchema,
  statusSourceSchema,
} from '../domainSchemas.js';
import type { DateSemantics, TaskView } from './taskTypes.js';

export const dateSemanticsSchema: z.ZodType<DateSemantics> = z.object({
  direct: nullableStringSchema,
  effective: nullableStringSchema,
  source: statusSourceSchema,
}).strict();

export const taskViewSchema: z.ZodType<TaskView> = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  note: z.string(),
  kind: z.enum(['action', 'action_group', 'project_root']),
  status: z.object({
    taskStatus: z.string(),
    completion: z.object({
      direct: z.boolean(),
      directDate: nullableStringSchema,
      effectiveDate: nullableStringSchema,
      source: statusSourceSchema,
    }).strict(),
    drop: z.object({
      direct: z.boolean(),
      directDate: nullableStringSchema,
      effectiveDate: nullableStringSchema,
      source: statusSourceSchema,
    }).strict(),
    flagged: z.object({
      direct: z.boolean(),
      effective: z.boolean(),
      source: statusSourceSchema,
    }).strict(),
  }).strict(),
  dates: z.object({
    due: dateSemanticsSchema,
    planned: dateSemanticsSchema,
    defer: dateSemanticsSchema,
  }).strict(),
  project: projectContextSchema.nullable(),
  location: z.object({ inInbox: z.boolean() }).strict(),
  hierarchy: z.object({
    parentId: nullableStringSchema,
    childIds: z.array(z.string()),
    hasChildren: z.boolean(),
    sequential: z.boolean(),
    completedByChildren: z.boolean(),
  }).strict(),
  tags: z.array(z.string()),
  repeat: z.object({
    isRepeating: z.boolean(),
    rule: nullableStringSchema,
  }).strict(),
  estimate: z.object({ minutes: z.number().nullable() }).strict(),
  timestamps: z.object({
    created: nullableStringSchema,
    modified: nullableStringSchema,
  }).strict(),
}).strict();

export const getTaskSuccessSchema = z.object({
  success: z.literal(true),
  task: taskViewSchema,
}).strict();

export const getTaskOutputSchema = getTaskSuccessSchema.shape;
