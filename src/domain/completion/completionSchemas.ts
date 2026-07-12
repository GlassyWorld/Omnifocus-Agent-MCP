import { z } from 'zod';
import {
  absoluteDateTimeSchema,
  nonEmptyStringSchema,
  nullableAbsoluteDateTimeSchema,
  projectContextSchema,
} from '../domainSchemas.js';
import type { CompletedTaskView } from './completionTypes.js';

export const completedTaskViewSchema: z.ZodType<CompletedTaskView> = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  note: z.string(),
  kind: z.enum(['action', 'action_group']),
  completedDate: absoluteDateTimeSchema,
  project: projectContextSchema.nullable(),
  location: z.object({ inInbox: z.boolean() }).strict(),
  tags: z.array(z.string()),
  timestamps: z.object({
    created: nullableAbsoluteDateTimeSchema,
    modified: nullableAbsoluteDateTimeSchema,
  }).strict(),
}).strict();

export const getCompletedSinceSuccessSchema = z.object({
  success: z.literal(true),
  completed: z.array(completedTaskViewSchema),
}).strict();

export const getCompletedSinceOutputSchema = getCompletedSinceSuccessSchema.shape;
