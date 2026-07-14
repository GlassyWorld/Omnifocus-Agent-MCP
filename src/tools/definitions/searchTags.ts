import { z } from 'zod';
import type { RequestHandlerExtra } from '../../types/sdkProtocolCompat.js';
import { adaptRawTagSnapshot } from '../../domain/tag/tagAdapter.js';
import { searchTags } from '../../domain/tag/searchTags.js';
import {
  searchTagsInputSchema,
  searchTagsOutputSchema,
  searchTagsSuccessSchema,
} from '../../domain/tag/tagSchemas.js';
import { readTags, ReadTagsResult } from '../primitives/readTags.js';
import { ToolErrorCode } from '../types/toolErrors.js';

export const schema = searchTagsInputSchema;
export const inputSchema = searchTagsInputSchema;
export const outputSchema = searchTagsOutputSchema;

type ToolArgs = z.infer<typeof searchTagsInputSchema>;
type TagReader = () => Promise<ReadTagsResult>;

export async function handler(args: ToolArgs, extra: RequestHandlerExtra) {
  return handleWithReader(args, extra, () => readTags());
}

async function handleWithReader(
  args: unknown,
  _extra: RequestHandlerExtra,
  reader: TagReader,
) {
  const parsedArgs = searchTagsInputSchema.safeParse(args);
  if (!parsedArgs.success) {
    return errorResponse(
      'invalid_arguments',
      'invalid_arguments',
      'The search_tags arguments did not match the required schema.',
    );
  }

  try {
    const snapshot = await reader();
    if (!snapshot.success) {
      return errorResponse('query_failed', snapshot.reason, snapshot.error);
    }

    const adapted = adaptRawTagSnapshot(snapshot.tags);
    if (!adapted.success) {
      return errorResponse('query_failed', adapted.reason, adapted.error);
    }

    const payload = searchTags(adapted.tags, parsedArgs.data);
    const structuredContent = searchTagsSuccessSchema.parse(payload);
    return {
      structuredContent,
      content: [{
        type: 'text' as const,
        text: JSON.stringify(structuredContent, null, 2),
      }],
    };
  } catch (_error) {
    return errorResponse(
      'query_failed',
      'process_failure',
      'The OmniFocus Tag snapshot could not be read safely.',
    );
  }
}

function errorResponse(code: ToolErrorCode, reason: string, message: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: false,
        error: { code, reason, message },
      }, null, 2),
    }],
    isError: true,
  };
}

export const _testExports = {
  handleWithReader,
};
