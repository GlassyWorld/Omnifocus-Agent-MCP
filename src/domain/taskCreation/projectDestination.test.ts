import { describe, expect, it, vi } from "vitest";
import {
  PROJECT_DESTINATION_RAW_FIELDS,
  resolveProjectById,
  validateProjectDestination,
} from "./projectDestination.js";

const active = {
  id: "project-1",
  name: "Project",
  status: "Active",
  containsSingletonActions: false,
  ancestorFolderDropped: false,
};

describe("Project destination resolver and validator", () => {
  it("queries one exact canonical ID with the fixed validation projection", async () => {
    const query = vi.fn().mockResolvedValue({ success: true, items: [active] });
    await expect(resolveProjectById("project-1", query)).resolves.toEqual({
      success: true,
      project: {
        id: "project-1",
        name: "Project",
        kind: "standard",
        rawStatus: "Active",
        ancestorFolderDropped: false,
      },
    });
    expect(query).toHaveBeenCalledWith({
      entity: "projects",
      filters: { projectId: "project-1" },
      fields: [...PROJECT_DESTINATION_RAW_FIELDS],
      includeCompleted: true,
      limit: 2,
    });
  });

  it.each([
    [{ success: true, items: [] }, "not_found"],
    [{ success: true, items: [active, active] }, "ambiguous_canonical_id"],
    [{ success: false, error: "temporary" }, "query_failed"],
    [{ success: true }, "schema_drift"],
    [{ success: true, items: [{ ...active, id: "other" }] }, "canonical_id_mismatch"],
    [{ success: true, items: [{ ...active, ancestorFolderDropped: undefined }] }, "ancestor_state_unknown"],
  ] as const)("returns stable reason %#", async (result, reason) => {
    await expect(resolveProjectById("project-1", async () => result as any))
      .resolves.toEqual({ success: false, reason });
  });

  it("classifies only deterministic target errors as terminal", () => {
    expect(validateProjectDestination("project-1", { success: false, reason: "not_found" })).toEqual({
      allowed: false,
      code: "project_not_found",
      reason: "not_found",
      retrySafe: false,
    });
    expect(validateProjectDestination("project-1", { success: false, reason: "query_failed" })).toEqual({
      allowed: false,
      code: "project_validation_failed",
      reason: "query_failed",
      retrySafe: true,
    });
  });

  it.each([
    ["OnHold", "on_hold"],
    ["Done", "done"],
    ["Dropped", "dropped"],
  ] as const)("rejects explicit %s status permanently", (rawStatus, reason) => {
    expect(validateProjectDestination("project-1", {
      success: true,
      project: {
        id: "project-1",
        name: "Project",
        kind: "standard",
        rawStatus,
        ancestorFolderDropped: false,
      },
    })).toMatchObject({
      allowed: false,
      code: "project_not_active",
      reason,
      retrySafe: false,
    });
  });

  it("rejects a confirmed Dropped ancestor permanently", () => {
    expect(validateProjectDestination("project-1", {
      success: true,
      project: {
        id: "project-1",
        name: "Project",
        kind: "single_actions",
        rawStatus: "Active",
        ancestorFolderDropped: true,
      },
    })).toMatchObject({
      allowed: false,
      code: "project_not_active",
      reason: "dropped_ancestor",
      retrySafe: false,
    });
  });

  it("independently rejects a resolver canonical-ID mismatch", () => {
    expect(validateProjectDestination("project-1", {
      success: true,
      project: {
        id: "other",
        name: "Project",
        kind: "standard",
        rawStatus: "Active",
        ancestorFolderDropped: false,
      },
    })).toMatchObject({
      allowed: false,
      code: "project_validation_failed",
      reason: "canonical_id_mismatch",
      retrySafe: true,
    });
  });
});
