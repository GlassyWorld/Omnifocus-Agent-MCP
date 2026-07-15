import { describe, expect, it } from "vitest";
import { getServerInstructions } from "./serverInstructions.js";

describe("getServerInstructions", () => {
  it("front-loads the personal-production capability boundary and all six tool routes", () => {
    const instructions = getServerInstructions("personal-production");
    const opening = instructions.slice(0, 1024);

    expect(opening).toContain("curated personal production profile");
    expect(opening).toContain("server-side tool registration");
    expect(opening).toContain("smallest sufficient tool set");
    expect(opening).toContain("Reading and analysis remain the default behavior");

    for (const toolName of [
      "get_lean_snapshot",
      "get_project",
      "get_task",
      "get_completed_since",
      "search_tags",
      "create_task",
    ]) {
      expect(opening).toContain(toolName);
    }
  });

  it("includes the production Domain, review, truncation, error, and answer rules", () => {
    const instructions = getServerInstructions("personal-production");

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

  it("does not advertise capabilities excluded from personal-production", () => {
    const instructions = getServerInstructions("personal-production");

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

    expect(instructions).not.toContain("personal-readonly");
    expect(instructions).toContain("write-disabled canary mode");
    expect(instructions).toContain("success=true");
    expect(instructions).toContain("do not silently omit it or fall back to Inbox");
    expect(instructions).toContain("fresh UUID idempotencyKey");
    expect(instructions).toContain("reuse exactly the same key");
    expect(instructions).toContain("Do not ask the user to supply");
    expect(instructions).toContain("planning, recommendations, statements, analysis");
    expect(instructions).toContain("destination is always explicit");
    expect(instructions).toContain("fresh get_project read");
    expect(instructions).toContain("Project name plus the available Folder");
    expect(instructions).toContain("A prior get_project call alone is insufficient");
    expect(instructions).toContain("fresh get_task read in the same user intent");
    expect(instructions).toContain("Only an existing Action Group is eligible");
    expect(instructions).toContain("Parent Task name and kind");
    expect(instructions).toContain("available parent-chain distinction");
    expect(instructions).toContain("A prior get_task call alone is insufficient");
    expect(instructions).toContain("leaf Action, Project Root");
    expect(instructions).toContain("parent_placement_disabled");
    expect(instructions).toContain("fall back to Inbox or Project");
    expect(instructions).toContain("separately accepted prepare/commit flow");
    expect(instructions).toContain("do not silently omit tagIds or create an untagged Task");
    expect(instructions).toContain("1-5 unique canonical IDs");
    expect(instructions).toContain("complete ancestor chains are Active");
    expect(instructions).toContain("full Tag path immediately before create_task");
    expect(instructions).toContain("never use a name/path resolver");
    expect(instructions).toContain("never automatically create a missing Tag");
    expect(instructions).toContain("tag_assignment_disabled");
    expect(instructions).toContain("full root-to-self path segments");
    expect(instructions).toContain("If truncated=true");
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
