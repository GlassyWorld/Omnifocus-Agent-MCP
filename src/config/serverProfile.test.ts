import { describe, expect, it } from "vitest";
import { resolveServerProfile } from "./serverProfile.js";

describe("resolveServerProfile", () => {
  it.each([
    [undefined, "upstream-full"],
    ["", "upstream-full"],
    ["   ", "upstream-full"],
    [" personal-readonly ", "personal-readonly"],
    ["upstream-full", "upstream-full"],
  ] as const)("resolves %s to %s", (value, expected) => {
    expect(resolveServerProfile(value)).toBe(expected);
  });

  it.each(["readonly", "personal-readlonly", "test"])(
    "rejects invalid profile %s and lists the allowed values",
    (value) => {
      expect(() => resolveServerProfile(value)).toThrowError(
        `Invalid OMNIFOCUS_MCP_PROFILE value "${value}". Allowed values: personal-readonly, upstream-full.`
      );
    }
  );
});
