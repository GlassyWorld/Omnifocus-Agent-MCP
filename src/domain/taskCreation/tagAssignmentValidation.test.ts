import { describe, expect, it } from "vitest";
import {
  validateRequestedTagClosure,
  type TagLookup,
} from "./tagAssignmentValidation.js";

type TagFixture = {
  id: string;
  status: "Active" | "OnHold" | "Dropped" | "Future";
  parent: TagFixture | null;
  childrenAreMutuallyExclusive: boolean;
};

function tag(
  id: string,
  options: Partial<Omit<TagFixture, "id">> = {},
): TagFixture {
  return {
    id,
    status: options.status ?? "Active",
    parent: options.parent ?? null,
    childrenAreMutuallyExclusive: options.childrenAreMutuallyExclusive ?? false,
  };
}

function lookup(...tags: TagFixture[]): TagLookup {
  const byId = new Map(tags.map(item => [item.id, item]));
  return { byIdentifier: id => byId.get(id) ?? null };
}

describe("requested Tag closure validation", () => {
  it("resolves exact IDs, validates all ancestors, and sorts intent IDs", () => {
    const root = tag("root");
    const parent = tag("parent", { parent: root });
    const child = tag("child", { parent });
    const other = tag("other");
    expect(validateRequestedTagClosure(["other", "child"], lookup(child, other)))
      .toEqual({
        success: true,
        requestedIdsSorted: ["child", "other"],
        resolvedTags: [other, child],
      });
  });

  it("does not inspect unrelated malformed Tags", () => {
    const requested = tag("requested");
    const unrelated = tag("unrelated", { status: "Future" });
    expect(validateRequestedTagClosure(["requested"], lookup(requested, unrelated)))
      .toMatchObject({ success: true });
  });

  it("returns tag_not_found only for an exact null lookup", () => {
    expect(validateRequestedTagClosure(["missing"], lookup()))
      .toEqual({ success: false, code: "tag_not_found", reason: "not_found" });
  });

  it("fails closed on lookup throws and canonical roundtrip mismatch", () => {
    expect(validateRequestedTagClosure(["tag-1"], {
      byIdentifier: () => { throw new Error("unavailable"); },
    })).toEqual({ success: false, code: "tag_validation_failed", reason: "lookup_failed" });
    expect(validateRequestedTagClosure(["tag-1"], {
      byIdentifier: () => tag("other"),
    })).toEqual({
      success: false,
      code: "tag_validation_failed",
      reason: "canonical_id_mismatch",
    });
  });

  it.each([
    ["OnHold", "self_on_hold"],
    ["Dropped", "self_dropped"],
  ] as const)("rejects a %s requested Tag", (status, reason) => {
    const requested = tag("requested", { status });
    expect(validateRequestedTagClosure(["requested"], lookup(requested)))
      .toEqual({ success: false, code: "tag_not_allowed", reason });
  });

  it.each([
    ["OnHold", "ancestor_on_hold"],
    ["Dropped", "ancestor_dropped"],
  ] as const)("rejects an Active child under a %s ancestor", (status, reason) => {
    const parent = tag("parent", { status });
    const child = tag("child", { parent });
    expect(validateRequestedTagClosure(["child"], lookup(child)))
      .toEqual({ success: false, code: "tag_not_allowed", reason });
  });

  it("rejects two direct children from one mutually exclusive parent", () => {
    const parent = tag("group", { childrenAreMutuallyExclusive: true });
    const first = tag("first", { parent });
    const second = tag("second", { parent });
    expect(validateRequestedTagClosure(["first", "second"], lookup(first, second)))
      .toEqual({
        success: false,
        code: "mutually_exclusive_tags",
        reason: "mutually_exclusive",
      });
  });

  it("allows different groups and does not treat parent plus child as exclusive", () => {
    const groupA = tag("group-a", { childrenAreMutuallyExclusive: true });
    const groupB = tag("group-b", { childrenAreMutuallyExclusive: true });
    const first = tag("first", { parent: groupA });
    const second = tag("second", { parent: groupB });
    expect(validateRequestedTagClosure(["first", "second"], lookup(first, second)))
      .toMatchObject({ success: true });
    expect(validateRequestedTagClosure(["group-a", "first"], lookup(groupA, first)))
      .toMatchObject({ success: true });
  });

  it("fails closed for a repeated parent ID cycle", () => {
    const first = tag("first");
    const second = tag("second", { parent: first });
    first.parent = second;
    expect(validateRequestedTagClosure(["first"], lookup(first)))
      .toEqual({ success: false, code: "tag_validation_failed", reason: "parent_cycle" });
  });

  it("fails closed for unknown status, malformed IDs, and unreadable properties", () => {
    const future = tag("future", { status: "Future" });
    expect(validateRequestedTagClosure(["future"], lookup(future)))
      .toEqual({ success: false, code: "tag_validation_failed", reason: "unknown_status" });

    const malformed = { ...tag("requested"), id: "" };
    expect(validateRequestedTagClosure(["requested"], { byIdentifier: () => malformed }))
      .toEqual({ success: false, code: "tag_validation_failed", reason: "malformed_id" });

    const parent = { id: "parent", status: "Active", parent: null };
    const child = tag("child", { parent: parent as TagFixture });
    expect(validateRequestedTagClosure(["child"], lookup(child)))
      .toEqual({ success: false, code: "tag_validation_failed", reason: "property_unreadable" });

    const missingParent = { id: "child", status: "Active", childrenAreMutuallyExclusive: false };
    expect(validateRequestedTagClosure(["child"], { byIdentifier: () => missingParent }))
      .toEqual({ success: false, code: "tag_validation_failed", reason: "parent_unreadable" });
  });

  it("defensively rejects duplicate requested IDs", () => {
    const requested = tag("requested");
    expect(validateRequestedTagClosure(["requested", "requested"], lookup(requested)))
      .toEqual({
        success: false,
        code: "tag_validation_failed",
        reason: "duplicate_requested_id",
      });
  });
});
