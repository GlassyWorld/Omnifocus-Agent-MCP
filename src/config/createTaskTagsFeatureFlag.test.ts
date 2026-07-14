import { describe, expect, it } from "vitest";
import { isCreateTaskTagAssignmentEnabled } from "./createTaskTagsFeatureFlag.js";

describe("OMNIFOCUS_CREATE_TASK_TAGS_ENABLED", () => {
  it.each([
    undefined,
    "",
    "false",
    "FALSE",
    "TRUE",
    "True",
    "1",
    "yes",
    " true ",
  ])("fails closed for %s", value => {
    expect(isCreateTaskTagAssignmentEnabled({
      OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: value,
    })).toBe(false);
  });

  it("enables Tag assignment only for exact lowercase true", () => {
    expect(isCreateTaskTagAssignmentEnabled({
      OMNIFOCUS_CREATE_TASK_TAGS_ENABLED: "true",
    })).toBe(true);
  });
});
