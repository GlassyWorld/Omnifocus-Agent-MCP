import { z } from 'zod';
import { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { mapRawTaskToTaskView } from '../../domain/task/taskMapper.js';
import { getTask } from '../primitives/getTask.js';
import { ToolErrorCode } from '../types/toolErrors.js';

export const schema = z.object({
  id: z.string().optional().describe("Exact OmniFocus task ID. Provide either id or name, not both."),
  name: z.string().optional().describe("Exact OmniFocus task name. Case-sensitive. Provide either name or id, not both."),
});

export async function handler(args: z.infer<typeof schema>, extra: RequestHandlerExtra) {
  const validationError = validateArgs(args);
  if (validationError) {
    return errorResponse("invalid_arguments", validationError);
  }

  try {
    const result = await getTask(
      args.id !== undefined
        ? { id: args.id }
        : { name: args.name! }
    );

    if (!result.success) {
      return errorResponse("query_failed", result.error);
    }

    if (result.tasks.length === 0) {
      return errorResponse("not_found", "Task not found.");
    }

    if (result.tasks.length > 1) {
      return errorResponse("ambiguous_match", "More than one task matched the exact locator.");
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          task: mapRawTaskToTaskView(result.tasks[0]),
        }, null, 2),
      }],
    };
  } catch (err: unknown) {
    const error = err as Error;
    return errorResponse("query_failed", error.message);
  }
}

function validateArgs(args: z.infer<typeof schema>): string | null {
  const hasId = args.id !== undefined;
  const hasName = args.name !== undefined;

  if (hasId && hasName) {
    return "Provide either id or name, not both.";
  }
  if (!hasId && !hasName) {
    return "Provide either id or name.";
  }
  if (hasId && args.id === "") {
    return "id must be a non-empty string.";
  }
  if (hasName && args.name!.trim().length === 0) {
    return "name must not be empty or whitespace only.";
  }
  return null;
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
  validateArgs,
};
