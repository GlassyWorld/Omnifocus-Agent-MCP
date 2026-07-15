import { z } from "zod";

export const parentKnownTaskStatusSchema = z.enum([
  "Available",
  "Blocked",
  "Completed",
  "Dropped",
  "DueSoon",
  "Next",
  "Overdue",
]);

const parentStateFactsShape = {
  taskStatus: parentKnownTaskStatusSchema,
  completion: z.object({
    direct: z.boolean(),
    effectiveDate: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
  drop: z.object({
    direct: z.boolean(),
    effectiveDate: z.string().datetime({ offset: true }).nullable(),
  }).strict(),
} as const;

const parentProjectFactsSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.enum(["Active", "OnHold", "Done", "Dropped"]),
}).strict();

const parentFolderFactsSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  status: z.enum(["Active", "Dropped"]),
}).strict();

const parentChainFactsSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "action_group", "project_root"]),
  ...parentStateFactsShape,
}).strict();

export const parentTaskFactsSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  kind: z.enum(["action", "action_group", "project_root"]),
  ...parentStateFactsShape,
  project: parentProjectFactsSchema.nullable(),
  folderChain: z.array(parentFolderFactsSchema).max(128),
  parentChain: z.array(parentChainFactsSchema).max(128),
}).strict();

export type ParentTaskFacts = z.infer<typeof parentTaskFactsSchema>;

export type ParentReadFailureReason =
  | "not_found"
  | "query_failed"
  | "schema_drift"
  | "adapter_failed"
  | "unknown_status"
  | "malformed_id"
  | "canonical_id_mismatch"
  | "parent_chain_unreadable"
  | "ancestor_state_unknown"
  | "parent_chain_cycle"
  | "orphan_parent";

export type ParentEligibilityReason =
  | "project_root_not_allowed"
  | "unsupported_parent_kind"
  | "self_completed"
  | "self_dropped"
  | "ancestor_completed"
  | "ancestor_dropped"
  | "project_not_active"
  | "dropped_folder_ancestor";

export type ParentTaskFactsRead =
  | { success: true; facts: ParentTaskFacts }
  | { success: false; reason: ParentReadFailureReason };

export type ParentDestinationValidation =
  | { allowed: true; facts: ParentTaskFacts }
  | {
      allowed: false;
      code:
        | "parent_not_found"
        | "parent_not_allowed"
        | "parent_not_active"
        | "parent_validation_failed";
      reason: ParentReadFailureReason | ParentEligibilityReason;
      retrySafe: boolean;
    };

export function validateParentDestination(
  requestedId: string,
  read: ParentTaskFactsRead,
): ParentDestinationValidation {
  if (!read.success) {
    return {
      allowed: false,
      code: read.reason === "not_found" ? "parent_not_found" : "parent_validation_failed",
      reason: read.reason,
      retrySafe: read.reason === "query_failed",
    };
  }

  const { facts } = read;
  if (facts.id !== requestedId) {
    return denied("parent_validation_failed", "canonical_id_mismatch");
  }
  if (facts.kind === "project_root") {
    return denied("parent_not_allowed", "project_root_not_allowed");
  }
  if (facts.kind !== "action_group") {
    return denied("parent_not_allowed", "unsupported_parent_kind");
  }
  if (facts.completion.direct || facts.completion.effectiveDate !== null) {
    return denied("parent_not_active", "self_completed");
  }
  if (facts.drop.direct || facts.drop.effectiveDate !== null) {
    return denied("parent_not_active", "self_dropped");
  }
  if (facts.taskStatus === "Completed") {
    return denied("parent_not_active", "self_completed");
  }
  if (facts.taskStatus === "Dropped") {
    return denied("parent_not_active", "self_dropped");
  }
  if (facts.parentChain.some(ancestor => (
    ancestor.completion.direct || ancestor.completion.effectiveDate !== null
  ))) {
    return denied("parent_not_active", "ancestor_completed");
  }
  if (facts.parentChain.some(ancestor => (
    ancestor.drop.direct || ancestor.drop.effectiveDate !== null
  ))) {
    return denied("parent_not_active", "ancestor_dropped");
  }
  if (facts.project !== null && facts.project.status !== "Active") {
    return denied("parent_not_active", "project_not_active");
  }
  if (facts.folderChain.some(folder => folder.status === "Dropped")) {
    return denied("parent_not_active", "dropped_folder_ancestor");
  }
  return { allowed: true, facts };
}

function denied(
  code: "parent_not_allowed" | "parent_not_active" | "parent_validation_failed",
  reason: ParentReadFailureReason | ParentEligibilityReason,
): ParentDestinationValidation {
  return { allowed: false, code, reason, retrySafe: false };
}
