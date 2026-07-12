import { z } from 'zod';
import {
  nullableStringSchema,
  nonEmptyStringSchema,
  statusSourceSchema,
} from '../domainSchemas.js';
import type {
  ProjectDateSemantics,
  ProjectTaskStatusCounts,
  ProjectView,
} from './projectTypes.js';

export const projectDateSemanticsSchema: z.ZodType<ProjectDateSemantics> = z.object({
  direct: nullableStringSchema,
  effective: nullableStringSchema,
  source: statusSourceSchema,
}).strict();

export const projectTaskStatusCountsSchema: z.ZodType<ProjectTaskStatusCounts> = z.object({
  available: z.number().int().nonnegative(),
  next: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  dueSoon: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  dropped: z.number().int().nonnegative(),
}).strict();

export const projectViewSchema: z.ZodType<ProjectView> = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  note: z.string(),
  kind: z.enum(['standard', 'single_actions']),
  status: z.object({
    raw: z.string(),
    active: z.boolean(),
    onHold: z.boolean(),
    completed: z.boolean(),
    dropped: z.boolean(),
  }).strict(),
  sequential: z.boolean(),
  flagged: z.boolean(),
  completedByChildren: z.boolean(),
  folder: z.object({
    id: nonEmptyStringSchema,
    name: z.string(),
  }).strict().nullable(),
  dates: z.object({
    due: projectDateSemanticsSchema,
    defer: projectDateSemanticsSchema,
  }).strict(),
  tasks: z.object({
    directIds: z.array(nonEmptyStringSchema),
    allIds: z.array(nonEmptyStringSchema),
    total: z.number().int().nonnegative(),
    byStatus: projectTaskStatusCountsSchema,
  }).strict(),
  timestamps: z.object({
    created: nullableStringSchema,
    modified: nullableStringSchema,
  }).strict(),
}).strict();

export const getProjectSuccessSchema = z.object({
  success: z.literal(true),
  project: projectViewSchema,
}).strict();

export const getProjectOutputSchema = getProjectSuccessSchema.shape;
