import { describe, expect, it } from "vitest";
import { getServerInstructions } from "./serverInstructions.js";

describe("getServerInstructions", () => {
  it("front-loads the personal-readonly safety boundary and all four tool routes", () => {
    const instructions = getServerInstructions("personal-readonly");
    const opening = instructions.slice(0, 512);

    expect(opening).toContain("read-only OmniFocus Domain server");
    expect(opening).toContain("no mutation capability");
    expect(opening).toContain("smallest sufficient tool set");
    expect(opening).toContain("Never claim that OmniFocus was modified");

    for (const toolName of [
      "get_lean_snapshot",
      "get_project",
      "get_task",
      "get_completed_since",
    ]) {
      expect(opening).toContain(toolName);
    }
  });

  it("includes the production Domain, review, truncation, error, and answer rules", () => {
    const instructions = getServerInstructions("personal-readonly");

    for (const requiredTerm of [
      "truncated",
      "direct",
      "effective",
      "source",
      "ambiguous_match",
      "not_found",
      "invalid_arguments",
      "query_failed",
      "Confirmed facts",
      "Analysis / inference",
      "Recommendations",
    ]) {
      expect(instructions).toContain(requiredTerm);
    }

    expect(instructions).toContain("always provide an explicit since");
    expect(instructions).toContain("also provide until");
    expect(instructions).toContain("explicit UTC offset or Z");
    expect(instructions).toContain("successful empty result, not not_found");
    expect(instructions).toContain("use only context already returned or present in the conversation");
  });

  it("does not advertise capabilities excluded from personal-readonly", () => {
    const instructions = getServerInstructions("personal-readonly");

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
      "omnifocus://",
      "JXA",
    ]) {
      expect(instructions).not.toContain(forbiddenGuidance);
    }
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
    expect(instructions).not.toContain("This is a read-only OmniFocus Domain server");
  });
});
