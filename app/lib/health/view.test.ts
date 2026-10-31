import { describe, expect, it } from "vitest";

import { scoreTone, toHealthRow } from "./view";

describe("scoreTone", () => {
  it("separates complete, partial and critical products", () => {
    expect(scoreTone(100)).toBe("success");
    expect(scoreTone(85)).toBe("caution");
    expect(scoreTone(60)).toBe("caution");
    expect(scoreTone(55)).toBe("critical");
  });
});

describe("toHealthRow", () => {
  it("keeps only failed rules, with their labels and missing items", () => {
    const row = toHealthRow({
      productId: "gid://shopify/Product/42",
      title: "Hearty Stew",
      handle: "hearty-stew",
      status: "DRAFT",
      score: 80,
      results: [
        { ruleId: "ingredients", passed: false, missing: ["Ingredient list"] },
        { ruleId: "calories", passed: true, missing: [] },
      ],
    });

    expect(row).toEqual({
      productId: "gid://shopify/Product/42",
      adminId: "42",
      title: "Hearty Stew",
      status: "DRAFT",
      score: 80,
      tone: "caution",
      issues: [{ ruleId: "ingredients", label: "Ingredients", missing: ["Ingredient list"] }],
    });
  });
});
