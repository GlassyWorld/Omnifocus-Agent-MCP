import { describe, expect, it } from "vitest";
import { getServerInstructions } from "./serverInstructions.js";

describe("getServerInstructions", () => {
  it("routes the personal-readonly profile through only the four Domain tools", () => {
    const instructions = getServerInstructions("personal-readonly");

    for (const toolName of [
      "get_lean_snapshot",
      "get_project",
      "get_task",
      "get_completed_since",
    ]) {
      expect(instructions).toContain(toolName);
    }

    for (const forbiddenGuidance of [
      "add_omnifocus_task",
      "add_project",
      "remove_item",
      "edit_item",
      "batch_add_items",
      "batch_remove_items",
      "create_tag",
      "query_omnifocus",
      "dump_database",
    ]) {
      expect(instructions).not.toContain(forbiddenGuidance);
    }

    expect(instructions).toContain("No mutation capability is exposed");
  });

  it("keeps full-profile guidance and requires explicit write authorization", () => {
    const instructions = getServerInstructions("upstream-full");

    expect(instructions).toContain("query_omnifocus");
    expect(instructions).toContain("batch_add_items/batch_remove_items");
    expect(instructions).toContain(
      "Mutation tools must only be used when the user explicitly requests a specific write operation."
    );
    expect(instructions).toContain(
      "Analysis or recommendations do not constitute mutation authorization."
    );
  });
});
