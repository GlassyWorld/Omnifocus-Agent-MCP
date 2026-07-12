import { z } from 'zod';
import type { RequestHandlerExtra } from '../../types/sdkProtocolCompat.js';
import { mapRawCompletedTaskToView } from '../../domain/completion/completionMapper.js';
import { getCompletedSince } from '../primitives/getCompletedSince.js';
import { ToolErrorCode } from '../types/toolErrors.js';

const absoluteDateTimeSchema = z.string().datetime({ offset: true });

export const schema = z.object({
  since: z.string().optional().describe("Required ISO 8601 datetime with Z or explicit UTC offset. The inclusive lower completion time bound."),
  until: z.string().optional().describe("Optional ISO 8601 datetime with Z or explicit UTC offset. Defaults to the current time and is inclusive."),
});

type ToolArgs = z.infer<typeof schema>;

type NormalizedArgumentsResult =
  | { success: true; since: string; until: string }
  | { success: false; error: string };

export async function handler(args: ToolArgs, extra: RequestHandlerExtra) {
  const normalized = normalizeArguments(args);
  if (!normalized.success) {
    return errorResponse("invalid_arguments", normalized.error);
  }

  try {
    const result = await getCompletedSince({
      since: normalized.since,
      until: normalized.until,
    });

    if (!result.success) {
      return errorResponse("query_failed", result.error);
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          completed: result.tasks.map(mapRawCompletedTaskToView),
        }, null, 2),
      }],
    };
  } catch (err: unknown) {
    const error = err as Error;
    return errorResponse("query_failed", error.message);
  }
}

function normalizeArguments(
  args: ToolArgs,
  nowProvider: () => Date = () => new Date(),
): NormalizedArgumentsResult {
  if (args.since === undefined || args.since.trim().length === 0) {
    return { success: false, error: "since is required and must not be empty." };
  }

  const since = normalizeDateTime(args.since);
  if (since === null) {
    return { success: false, error: "since must be a valid ISO 8601 datetime with timezone." };
  }

  let until: string;
  if (args.until === undefined) {
    const now = nowProvider();
    until = now.toISOString();
  } else {
    if (args.until.trim().length === 0) {
      return { success: false, error: "until must not be empty." };
    }
    const normalizedUntil = normalizeDateTime(args.until);
    if (normalizedUntil === null) {
      return { success: false, error: "until must be a valid ISO 8601 datetime with timezone." };
    }
    until = normalizedUntil;
  }

  if (Date.parse(until) < Date.parse(since)) {
    return { success: false, error: "until must not be earlier than since." };
  }

  return { success: true, since, until };
}

function normalizeDateTime(value: string): string | null {
  if (!absoluteDateTimeSchema.safeParse(value).success) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function errorResponse(code: ToolErrorCode, message: string) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        success: false,
        error: {
          code,
          message,
        },
      }, null, 2),
    }],
    isError: true,
  };
}

export const _testExports = {
  normalizeArguments,
};
