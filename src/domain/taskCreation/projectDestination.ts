import { z } from "zod";
import { canonicalOmniFocusIdSchema } from "./createTaskSchemas.js";
import { queryOmnifocus } from "../../tools/primitives/queryOmnifocus.js";

export const PROJECT_DESTINATION_RAW_FIELDS = [
  "id",
  "name",
  "status",
  "containsSingletonActions",
  "ancestorFolderDropped",
] as const;

export type ProjectValidationReason =
  | "not_found"
  | "on_hold"
  | "done"
  | "dropped"
  | "dropped_ancestor"
  | "ambiguous_canonical_id"
  | "query_failed"
  | "adapter_failed"
  | "schema_drift"
  | "ancestor_state_unknown"
  | "canonical_id_mismatch";

export interface ResolvedProjectDestination {
  id: string;
  name: string;
  kind: "standard" | "single_actions";
  rawStatus: "Active" | "OnHold" | "Done" | "Dropped";
  ancestorFolderDropped: boolean;
}

export type ProjectDestinationResolution =
  | { success: true; project: ResolvedProjectDestination }
  | { success: false; reason: ProjectValidationReason };

export type ProjectDestinationValidation =
  | { allowed: true; project: ResolvedProjectDestination }
  | {
      allowed: false;
      code: "project_not_found" | "project_not_active" | "project_validation_failed";
      reason: ProjectValidationReason;
      retrySafe: boolean;
    };

type ProjectQuery = (params: {
  entity: "projects";
  filters: { projectId: string };
  fields: string[];
  includeCompleted: true;
  limit: 2;
}) => Promise<{ success: boolean; items?: unknown[]; error?: string }>;

const resolvedProjectSchema = z.object({
  id: canonicalOmniFocusIdSchema,
  name: z.string(),
  status: z.enum(["Active", "OnHold", "Done", "Dropped"]),
  containsSingletonActions: z.boolean(),
  ancestorFolderDropped: z.boolean(),
}).strict();

export async function resolveProjectById(
  projectId: string,
  query: ProjectQuery = queryOmnifocus,
): Promise<ProjectDestinationResolution> {
  let result;
  try {
    result = await query({
      entity: "projects",
      filters: { projectId },
      fields: [...PROJECT_DESTINATION_RAW_FIELDS],
      includeCompleted: true,
      limit: 2,
    });
  } catch {
    return { success: false, reason: "query_failed" };
  }

  if (!result.success) return { success: false, reason: "query_failed" };
  if (!Array.isArray(result.items)) return { success: false, reason: "schema_drift" };
  if (result.items.length === 0) return { success: false, reason: "not_found" };
  if (result.items.length > 1) return { success: false, reason: "ambiguous_canonical_id" };

  const parsed = resolvedProjectSchema.safeParse(result.items[0]);
  if (!parsed.success) {
    const candidate = result.items[0] as Record<string, unknown>;
    if (typeof candidate.ancestorFolderDropped !== "boolean") {
      return { success: false, reason: "ancestor_state_unknown" };
    }
    return { success: false, reason: "adapter_failed" };
  }
  if (parsed.data.id !== projectId) {
    return { success: false, reason: "canonical_id_mismatch" };
  }

  return {
    success: true,
    project: {
      id: parsed.data.id,
      name: parsed.data.name,
      kind: parsed.data.containsSingletonActions ? "single_actions" : "standard",
      rawStatus: parsed.data.status,
      ancestorFolderDropped: parsed.data.ancestorFolderDropped,
    },
  };
}

export function validateProjectDestination(
  requestedId: string,
  resolution: ProjectDestinationResolution,
): ProjectDestinationValidation {
  if (!resolution.success) {
    if (resolution.reason === "not_found") {
      return {
        allowed: false,
        code: "project_not_found",
        reason: resolution.reason,
        retrySafe: false,
      };
    }
    return {
      allowed: false,
      code: "project_validation_failed",
      reason: resolution.reason,
      retrySafe: true,
    };
  }

  if (resolution.project.id !== requestedId) {
    return {
      allowed: false,
      code: "project_validation_failed",
      reason: "canonical_id_mismatch",
      retrySafe: true,
    };
  }

  if (resolution.project.ancestorFolderDropped) {
    return {
      allowed: false,
      code: "project_not_active",
      reason: "dropped_ancestor",
      retrySafe: false,
    };
  }

  const reasonByStatus = {
    OnHold: "on_hold",
    Done: "done",
    Dropped: "dropped",
  } as const;
  if (resolution.project.rawStatus !== "Active") {
    return {
      allowed: false,
      code: "project_not_active",
      reason: reasonByStatus[resolution.project.rawStatus],
      retrySafe: false,
    };
  }

  return { allowed: true, project: resolution.project };
}
