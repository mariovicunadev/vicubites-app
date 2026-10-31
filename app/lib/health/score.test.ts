import { describe, expect, it } from "vitest";

import type { BulkNode } from "../bulk/jsonl";
import { hasMetafield, legacyId, productFromNode, type ProductData } from "./product";
import { RULES } from "./rules";
import { evaluateProduct, failedRules, summarize } from "./score";

const COMPLETE_METAFIELDS = {
  "custom.protein_min": "30.0",
  "custom.fat_min": "18.0",
  "custom.fiber_max": "4.0",
  "custom.moisture_max": "10.0",
  "custom.ingredients": '["gid://shopify/Metaobject/1"]',
  "custom.kcal_per_kg": "3900",
  "custom.species": "Dog",
  "custom.life_stage": "Puppy",
  "custom.food_type": "Dry",
  "custom.main_protein": "Chicken",
  "global.title_tag": "Puppy Chicken & Oat Recipe | Vicubites",
  "global.description_tag": "Dry dog food made with deboned chicken.",
};

function product(overrides: Partial<ProductData> = {}): ProductData {
  return {
    id: "gid://shopify/Product/1",
    title: "Puppy Chicken & Oat Recipe",
    handle: "puppy-chicken",
    status: "ACTIVE",
    metafields: COMPLETE_METAFIELDS,
    variants: [{ id: "gid://shopify/ProductVariant/1", title: "2 kg", sku: "VB-020" }],
    media: [{ id: "gid://shopify/MediaImage/1", alt: "Front of the bag" }],
    ...overrides,
  };
}

function without(...keys: string[]): Record<string, string> {
  return Object.fromEntries(
    Object.entries(COMPLETE_METAFIELDS).filter(([key]) => !keys.includes(key)),
  );
}

function missingFor(p: ProductData, ruleId: string): string[] {
  return evaluateProduct(p).results.find((r) => r.ruleId === ruleId)?.missing ?? [];
}

describe("rules", () => {
  it("have unique ids and weights that add up to 100", () => {
    expect(new Set(RULES.map((rule) => rule.id)).size).toBe(RULES.length);
    expect(RULES.reduce((sum, rule) => sum + rule.weight, 0)).toBe(100);
  });

  it("give a complete product 100", () => {
    const result = evaluateProduct(product());

    expect(result.score).toBe(100);
    expect(failedRules(result)).toEqual([]);
  });

  it("list each missing guaranteed analysis value", () => {
    const p = product({ metafields: without("custom.fat_min", "custom.moisture_max") });

    expect(missingFor(p, "guaranteed-analysis")).toEqual(["Crude fat (min)", "Moisture (max)"]);
  });

  it("treat an empty ingredient list as missing", () => {
    const p = product({ metafields: { ...COMPLETE_METAFIELDS, "custom.ingredients": "[]" } });

    expect(missingFor(p, "ingredients")).toEqual(["Ingredient list"]);
  });

  it("require at least one image and alt text on every image", () => {
    expect(missingFor(product({ media: [] }), "images")).toEqual(["At least one image"]);
    expect(missingFor(product({ media: [] }), "image-alt")).toEqual([]);

    const media = [
      { id: "gid://shopify/MediaImage/1", alt: "Front" },
      { id: "gid://shopify/MediaImage/2", alt: "  " },
      { id: "gid://shopify/MediaImage/3", alt: null },
    ];
    expect(missingFor(product({ media }), "image-alt")).toEqual(["Alt text on 2 of 3 images"]);
    expect(
      missingFor(product({ media: [{ id: "gid://shopify/MediaImage/9", alt: "" }] }), "image-alt"),
    ).toEqual(["Alt text on 1 of 1 image"]);
  });

  it("name the variants without a SKU", () => {
    const variants = [
      { id: "gid://shopify/ProductVariant/1", title: "2 kg", sku: "VB-020" },
      { id: "gid://shopify/ProductVariant/2", title: "7 kg", sku: null },
    ];

    expect(missingFor(product({ variants }), "sku")).toEqual(["SKU for 7 kg"]);
  });

  it("pass the SKU rule for a product without variants", () => {
    expect(missingFor(product({ variants: [] }), "sku")).toEqual([]);
  });
});

describe("evaluateProduct", () => {
  it("adds up the weights of the passing rules", () => {
    // Missing ingredients (20) and SEO (5).
    const p = product({
      metafields: without("custom.ingredients", "global.title_tag"),
    });
    const result = evaluateProduct(p);

    expect(result.score).toBe(75);
    expect(failedRules(result)).toEqual(["ingredients", "seo"]);
  });

  it("scores a product with no data at all", () => {
    const result = evaluateProduct(product({ metafields: {}, media: [], variants: [] }));

    // Only "image-alt" and "sku" pass (nothing to check): 10 + 5.
    expect(result.score).toBe(15);
  });
});

describe("summarize", () => {
  it("reports average score, products needing attention and per-rule pass counts", () => {
    const results = [
      evaluateProduct(product()),
      evaluateProduct(product({ metafields: without("custom.kcal_per_kg") })),
    ];
    const summary = summarize(results);

    expect(summary).toMatchObject({ products: 2, averageScore: 93, needsAttention: 1 });
    expect(summary.rules.find((r) => r.ruleId === "calories")).toMatchObject({
      passing: 1,
      total: 2,
    });
  });

  it("handles an empty catalog", () => {
    expect(summarize([])).toMatchObject({ products: 0, averageScore: 0, needsAttention: 0 });
  });
});

describe("productFromNode", () => {
  it("flattens a bulk export node", () => {
    const node: BulkNode = {
      record: { id: "gid://shopify/Product/9", title: "Wet Stew", handle: "stew", status: "DRAFT" },
      children: {
        Metafield: [
          { record: { namespace: "custom", key: "species", value: "Dog" }, children: {} },
        ],
        ProductVariant: [
          { record: { id: "gid://shopify/ProductVariant/1", title: "Can", sku: "" }, children: {} },
        ],
        MediaImage: [
          { record: { id: "gid://shopify/MediaImage/1", alt: "" }, children: {} },
        ],
      },
    };

    expect(productFromNode(node)).toEqual({
      id: "gid://shopify/Product/9",
      title: "Wet Stew",
      handle: "stew",
      status: "DRAFT",
      metafields: { "custom.species": "Dog" },
      variants: [{ id: "gid://shopify/ProductVariant/1", title: "Can", sku: null }],
      media: [{ id: "gid://shopify/MediaImage/1", alt: null }],
    });
  });
});

describe("helpers", () => {
  it("hasMetafield rejects blank values and malformed lists", () => {
    const p = product({
      metafields: { a: "  ", b: "[not json", c: "Dog", d: '["x"]' },
    });

    expect(["a", "b", "c", "d", "missing"].map((key) => hasMetafield(p, key))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });

  it("legacyId reads the numeric ID from a GID", () => {
    expect(legacyId("gid://shopify/Product/9599873777902")).toBe("9599873777902");
  });
});
