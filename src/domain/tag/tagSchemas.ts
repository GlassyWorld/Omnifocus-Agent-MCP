import { z } from 'zod';
import { nonEmptyStringSchema } from '../domainSchemas.js';

export const tagStatusSchema = z.enum(['active', 'on_hold', 'dropped']);

export const searchTagsInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  status: z.array(tagStatusSchema)
    .min(1)
    .max(3)
    .refine(values => new Set(values).size === values.length, {
      message: 'status values must be unique',
    })
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
}).strict();

// The raw boundary accepts any string status so the Adapter can distinguish an
// unknown future enum value from a malformed non-string field.
export const rawTagCandidateSchema = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  status: z.string(),
  parentId: nonEmptyStringSchema.nullable(),
  childrenAreMutuallyExclusive: z.boolean(),
}).strict();

export const tagPathSegmentSchema = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  status: tagStatusSchema,
}).strict();

export const tagDiscoveryViewSchema = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
  status: tagStatusSchema,
  hierarchy: z.object({
    parentId: nonEmptyStringSchema.nullable(),
    childIds: z.array(nonEmptyStringSchema),
    path: z.array(tagPathSegmentSchema).min(1),
  }).strict(),
  exclusivity: z.object({
    childrenAreMutuallyExclusive: z.boolean(),
    memberOfMutuallyExclusiveGroupId: nonEmptyStringSchema.nullable(),
  }).strict(),
}).strict();

export const searchTagsSuccessSchema = z.object({
  success: z.literal(true),
  tags: z.array(tagDiscoveryViewSchema),
  page: z.object({
    matched: z.number().int().nonnegative(),
    returned: z.number().int().nonnegative(),
    truncated: z.boolean(),
  }).strict(),
}).strict();

export const searchTagsOutputSchema = searchTagsSuccessSchema.shape;

export type TagStatus = z.infer<typeof tagStatusSchema>;
export type RawTagCandidate = z.infer<typeof rawTagCandidateSchema>;
export type TagPathSegment = z.infer<typeof tagPathSegmentSchema>;
export type TagDiscoveryView = z.infer<typeof tagDiscoveryViewSchema>;
export type SearchTagsInput = z.infer<typeof searchTagsInputSchema>;
export type SearchTagsSuccess = z.infer<typeof searchTagsSuccessSchema>;
