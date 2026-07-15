import { describe, expect, it } from "vitest";
import {
  validateParentDestination,
  type ParentTaskFacts,
} from "./parentDestination.js";

function facts(overrides: Partial<ParentTaskFacts> = {}): ParentTaskFacts {
  return {
    id: "parent-1",
    name: "Parent",
    kind: "action_group",
    taskStatus: "Available",
    completion: { direct: false, effectiveDate: null },
    drop: { direct: false, effectiveDate: null },
    project: { id: "project-1", name: "Project", status: "Active" },
    folderChain: [{ id: "folder-1", name: "Folder", status: "Active" }],
    parentChain: [],
    ...overrides,
  };
}

describe("validateParentDestination", () => {
  it("allows only an exact active action group", () => {
    expect(validateParentDestination("parent-1", {
      success: true,
      facts: facts(),
    })).toEqual({ allowed: true, facts: facts() });
    expect(validateParentDestination("different", {
      success: true,
      facts: facts(),
    })).toMatchObject({
      allowed: false,
      code: "parent_validation_failed",
      reason: "canonical_id_mismatch",
      retrySafe: false,
    });
  });

  it("allows a known Blocked action group when completion/drop ancestry remains eligible", () => {
    expect(validateParentDestination("parent-1", {
      success: true,
      facts: facts({ taskStatus: "Blocked" }),
    })).toMatchObject({ allowed: true });
  });

  it.each([
    [facts({ kind: "action" }), "parent_not_allowed", "unsupported_parent_kind"],
    [facts({ kind: "project_root" }), "parent_not_allowed", "project_root_not_allowed"],
    [facts({ completion: { direct: true, effectiveDate: null } }), "parent_not_active", "self_completed"],
    [facts({ taskStatus: "Completed" }), "parent_not_active", "self_completed"],
    [facts({ drop: { direct: true, effectiveDate: null } }), "parent_not_active", "self_dropped"],
    [facts({ taskStatus: "Dropped" }), "parent_not_active", "self_dropped"],
    [facts({ drop: { direct: false, effectiveDate: "2026-07-15T00:00:00.000Z" } }), "parent_not_active", "self_dropped"],
    [facts({ parentChain: [{ id: "ancestor", kind: "action_group", taskStatus: "Completed", completion: { direct: false, effectiveDate: "2026-07-15T00:00:00.000Z" }, drop: { direct: false, effectiveDate: null } }] }), "parent_not_active", "ancestor_completed"],
    [facts({ parentChain: [{ id: "ancestor", kind: "action_group", taskStatus: "Dropped", completion: { direct: false, effectiveDate: null }, drop: { direct: true, effectiveDate: null } }] }), "parent_not_active", "ancestor_dropped"],
    [facts({ project: { id: "project-1", name: "Project", status: "OnHold" } }), "parent_not_active", "project_not_active"],
    [facts({ project: { id: "project-1", name: "Project", status: "Done" } }), "parent_not_active", "project_not_active"],
    [facts({ project: { id: "project-1", name: "Project", status: "Dropped" } }), "parent_not_active", "project_not_active"],
    [facts({ folderChain: [{ id: "folder-1", name: "Folder", status: "Dropped" }] }), "parent_not_active", "dropped_folder_ancestor"],
  ] as const)("rejects deterministic ineligible facts %#", (candidate, code, reason) => {
    expect(validateParentDestination("parent-1", { success: true, facts: candidate }))
      .toMatchObject({ allowed: false, code, reason, retrySafe: false });
  });

  it.each([
    ["not_found", "parent_not_found", false],
    ["query_failed", "parent_validation_failed", true],
    ["schema_drift", "parent_validation_failed", false],
    ["unknown_status", "parent_validation_failed", false],
    ["parent_chain_cycle", "parent_validation_failed", false],
    ["orphan_parent", "parent_validation_failed", false],
  ] as const)("maps read failure %s fail closed", (reason, code, retrySafe) => {
    expect(validateParentDestination("parent-1", { success: false, reason }))
      .toEqual({ allowed: false, code, reason, retrySafe });
  });
});
