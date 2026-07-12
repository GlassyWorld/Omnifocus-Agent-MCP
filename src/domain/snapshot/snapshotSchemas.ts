import { z } from 'zod';
import {
  nullableAbsoluteDateTimeSchema,
  nonEmptyStringSchema,
  projectContextSchema,
  statusSourceSchema,
  absoluteDateTimeSchema,
} from '../domainSchemas.js';
import { projectTaskStatusCountsSchema } from '../project/projectSchemas.js';
import type {
  LeanProjectSummary,
  LeanSnapshotView,
  LeanTaskSummary,
} from './snapshotTypes.js';

export const activeTaskStatusSchema = z.enum([
  'Available',
  'Blocked',
  'DueSoon',
  'Next',
  'Overdue',
]);

export const attentionReasonSchema = z.enum([
  'overdue',
  'dueSoon',
  'planned',
  'flagged',
]);

export const projectDeadlineStateSchema = z.enum(['overdue', 'dueSoon']);

const absoluteDateSemanticsSchema = z.object({
  direct: nullableAbsoluteDateTimeSchema,
  effective: nullableAbsoluteDateTimeSchema,
  source: statusSourceSchema,
}).strict();

export const leanTaskSummarySchema: z.ZodType<LeanTaskSummary> = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  hasNote: z.boolean(),
  kind: z.enum(['action', 'action_group']),
  project: projectContextSchema.nullable(),
  location: z.object({ inInbox: z.boolean() }).strict(),
  status: z.object({ taskStatus: activeTaskStatusSchema }).strict(),
  dates: z.object({
    due: absoluteDateSemanticsSchema,
    planned: absoluteDateSemanticsSchema,
    defer: absoluteDateSemanticsSchema,
  }).strict(),
  flagged: z.object({
    direct: z.boolean(),
    effective: z.boolean(),
    source: statusSourceSchema,
  }).strict(),
  tags: z.array(z.string()),
}).strict();

export const leanProjectSummarySchema: z.ZodType<LeanProjectSummary> = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  hasNote: z.boolean(),
  kind: z.enum(['standard', 'single_actions']),
  status: z.literal('Active'),
  folder: z.object({
    id: nonEmptyStringSchema,
    name: z.string(),
  }).strict().nullable(),
  sequential: z.boolean(),
  flagged: z.boolean(),
  dates: z.object({
    due: absoluteDateSemanticsSchema,
    planned: absoluteDateSemanticsSchema,
    defer: absoluteDateSemanticsSchema,
  }).strict(),
  tasks: z.object({
    total: z.number().int().nonnegative(),
    byStatus: projectTaskStatusCountsSchema,
  }).strict(),
}).strict();

const leanProjectDeadlineItemSchema = z.object({
  project: leanProjectSummarySchema,
  state: projectDeadlineStateSchema,
}).strict();

function snapshotListSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    total: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    truncated: z.boolean(),
    items: z.array(itemSchema),
  }).strict();
}

const leanAttentionItemSchema = z.object({
  task: leanTaskSummarySchema,
  reasons: z.array(attentionReasonSchema).min(1),
}).strict();

export const leanSnapshotViewSchema: z.ZodType<LeanSnapshotView> = z.object({
  generatedAt: absoluteDateTimeSchema,
  scope: z.literal('all'),
  projects: z.object({
    active: snapshotListSchema(leanProjectSummarySchema),
    planned: snapshotListSchema(leanProjectSummarySchema),
    deadline: snapshotListSchema(leanProjectDeadlineItemSchema),
  }).strict(),
  attention: z.object({
    total: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    truncated: z.boolean(),
    byReason: z.object({
      overdue: z.number().int().nonnegative(),
      dueSoon: z.number().int().nonnegative(),
      planned: z.number().int().nonnegative(),
      flagged: z.number().int().nonnegative(),
    }).strict(),
    items: z.array(leanAttentionItemSchema),
  }).strict(),
  inbox: snapshotListSchema(leanTaskSummarySchema),
}).strict();

export const getLeanSnapshotSuccessSchema = z.object({
  success: z.literal(true),
  snapshot: leanSnapshotViewSchema,
}).strict();

export const getLeanSnapshotOutputSchema = getLeanSnapshotSuccessSchema.shape;
