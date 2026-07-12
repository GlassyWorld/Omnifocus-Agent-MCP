import { z } from 'zod';

export const statusSourceSchema = z.enum(['direct', 'inherited', 'none']);
export const nonEmptyStringSchema = z.string().min(1);

export const projectContextSchema = z.object({
  id: nonEmptyStringSchema,
  name: z.string(),
}).strict();

export const absoluteDateTimeSchema = z.string().datetime({ offset: true });
export const nullableAbsoluteDateTimeSchema = absoluteDateTimeSchema.nullable();
export const nullableStringSchema = z.string().nullable();
