import { z } from 'zod';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { getLeanSnapshot } from '../primitives/getLeanSnapshot.js';
import { ToolErrorCode } from '../types/toolErrors.js';

const DEFAULT_LIMIT_PER_SECTION = 25;

export const schema = z.object({
  limitPerSection: z.number().optional().describe(
    'Maximum items returned independently for active projects, attention, and Inbox. Integer from 1 through 100. Defaults to 25.',
  ),
});

type ToolArgs = z.infer<typeof schema>;
type Clock = () => Date;

export async function handler(args: ToolArgs, extra: RequestHandlerExtra) {
  return handleWithClock(args, extra, () => new Date());
}

async function handleWithClock(args: ToolArgs, extra: RequestHandlerExtra, clock: Clock) {
  const limitPerSection = args.limitPerSection === undefined
    ? DEFAULT_LIMIT_PER_SECTION
    : args.limitPerSection;
  if (!Number.isInteger(limitPerSection) || limitPerSection < 1 || limitPerSection > 100) {
    return errorResponse('invalid_arguments', 'limitPerSection must be an integer from 1 through 100.');
  }

  try {
    const generatedAt = clock().toISOString();
    const result = await getLeanSnapshot({ generatedAt, limitPerSection });
    if (!result.success) {
      return errorResponse('query_failed', result.error);
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ success: true, snapshot: result.snapshot }, null, 2),
      }],
    };
  } catch (error) {
    return errorResponse(
      'query_failed',
      error instanceof Error ? error.message : 'Unknown Lean Snapshot error',
    );
  }
}

function errorResponse(code: ToolErrorCode, message: string) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ success: false, error: { code, message } }, null, 2),
    }],
    isError: true,
  };
}

export const _testExports = {
  DEFAULT_LIMIT_PER_SECTION,
  handleWithClock,
};
