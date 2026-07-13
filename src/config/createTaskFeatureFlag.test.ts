import { describe, expect, it } from "vitest";
import { isCreateTaskMutationEnabled } from "./createTaskFeatureFlag.js";

describe("OMNIFOCUS_CREATE_TASK_ENABLED", () => {
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
    expect(isCreateTaskMutationEnabled({ OMNIFOCUS_CREATE_TASK_ENABLED: value })).toBe(false);
  });

  it("enables mutation only for exact lowercase true", () => {
    expect(isCreateTaskMutationEnabled({ OMNIFOCUS_CREATE_TASK_ENABLED: "true" })).toBe(true);
  });
});
