import { describe, expect, it } from "vitest";
import { resolveServerProfile } from "./serverProfile.js";

describe("resolveServerProfile", () => {
  it.each([
    [undefined, "personal-production"],
    ["", "personal-production"],
    ["   ", "personal-production"],
    [" personal-production ", "personal-production"],
    ["upstream-full", "upstream-full"],
  ] as const)("resolves %s to %s", (value, expected) => {
    expect(resolveServerProfile(value)).toBe(expected);
  });

  it.each(["personal-readonly", "readonly", "personal-readlonly", "test"])(
    "rejects invalid profile %s and lists the allowed values",
    (value) => {
      expect(() => resolveServerProfile(value)).toThrowError(
        `Invalid OMNIFOCUS_MCP_PROFILE value "${value}". Allowed values: personal-production, upstream-full.`
      );
    }
  );
});
