import { z } from 'zod';
import type { RequestHandlerExtra } from '../../types/sdkProtocolCompat.js';
import { mapRawProjectToProjectView } from '../../domain/project/projectMapper.js';
import { getProject } from '../primitives/getProject.js';
import { ToolErrorCode } from '../types/toolErrors.js';

export const schema = z.object({
  id: z.string().optional().describe("Exact canonical OmniFocus project root task ID. Provide either id or name, not both."),
  name: z.string().optional().describe("Exact OmniFocus project name. Case-sensitive. Provide either name or id, not both."),
});

export async function handler(args: z.infer<typeof schema>, extra: RequestHandlerExtra) {
  const validationError = validateArgs(args);
  if (validationError) {
    return errorResponse("invalid_arguments", validationError);
  }

  try {
    const result = await getProject(
      args.id !== undefined
        ? { id: args.id }
        : { name: args.name! }
    );

    if (!result.success) {
      return errorResponse("query_failed", result.error);
    }

    if (result.projects.length === 0) {
      return errorResponse("not_found", "Project not found.");
    }

    if (result.projects.length > 1) {
      return errorResponse("ambiguous_match", "More than one project matched the exact locator.");
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          project: mapRawProjectToProjectView(result.projects[0]),
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
