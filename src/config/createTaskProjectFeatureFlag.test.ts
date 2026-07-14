import { describe, expect, it } from "vitest";
import { isCreateTaskProjectPlacementEnabled } from "./createTaskProjectFeatureFlag.js";

describe("create_task Project placement feature flag", () => {
  it("enables only for exact lowercase true", () => {
    expect(isCreateTaskProjectPlacementEnabled({ OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED: "true" })).toBe(true);
  });

  it.each([undefined, "", "false", "TRUE", "1"])(
    "fails closed for %s",
    value => {
      expect(isCreateTaskProjectPlacementEnabled({
        OMNIFOCUS_CREATE_TASK_PROJECT_ENABLED: value,
      })).toBe(false);
    },
  );
});
