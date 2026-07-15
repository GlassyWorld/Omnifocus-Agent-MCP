import { describe, expect, it } from "vitest";
import { isCreateTaskParentPlacementEnabled } from "./createTaskParentFeatureFlag.js";

describe("OMNIFOCUS_CREATE_TASK_PARENT_ENABLED", () => {
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
    expect(isCreateTaskParentPlacementEnabled({
      OMNIFOCUS_CREATE_TASK_PARENT_ENABLED: value,
    })).toBe(false);
  });

  it("enables Parent placement only for exact lowercase true", () => {
    expect(isCreateTaskParentPlacementEnabled({
      OMNIFOCUS_CREATE_TASK_PARENT_ENABLED: "true",
    })).toBe(true);
  });
});
