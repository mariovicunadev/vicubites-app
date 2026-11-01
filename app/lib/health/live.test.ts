import { describe, expect, it } from "vitest";

import { productFromGraphql, productGid, type LiveProductNode } from "./live";
import { evaluateProduct } from "./score";

const B2B = "gid://shopify/Publication/10";
const ONLINE_STORE = "gid://shopify/Publication/1";

function node(overrides: Partial<LiveProductNode> = {}): LiveProductNode {
  return {
    id: "gid://shopify/Product/1",
    title: "Kitten Turkey Recipe",
    handle: "kitten-turkey",
    status: "DRAFT",
    requiresSellingPlan: false,
    variants: { nodes: [{ id: "gid://shopify/ProductVariant/1", title: "1 kg", sku: "" }] },
    metafields: {
      nodes: [
        { namespace: "custom", key: "species", value: "Cat" },
        { namespace: "global", key: "title_tag", value: "Kitten Turkey | Vicubites" },
      ],
    },
    media: { nodes: [{ id: "gid://shopify/MediaImage/1", alt: null }] },
    resourcePublicationsV2: { nodes: [{ publication: { id: ONLINE_STORE } }] },
    ...overrides,
  };
}

describe("productGid", () => {
  it("accepts a numeric ID or a product GID", () => {
    expect(productGid("123")).toBe("gid://shopify/Product/123");
    expect(productGid("gid://shopify/Product/123")).toBe("gid://shopify/Product/123");
  });

  it("rejects anything else", () => {
    expect(productGid("")).toBeNull();
    expect(productGid("gid://shopify/Collection/123")).toBeNull();
    expect(productGid("12a")).toBeNull();
  });
});

describe("productFromGraphql", () => {
  it("keys metafields by namespace.key and empties optional text to null", () => {
    const product = productFromGraphql(node(), []);
    expect(product.metafields).toEqual({
      "custom.species": "Cat",
      "global.title_tag": "Kitten Turkey | Vicubites",
    });
    expect(product.variants[0].sku).toBeNull();
    expect(product.media[0].alt).toBeNull();
  });

  it("checks each B2B catalog publication against the product's", () => {
    expect(productFromGraphql(node(), [B2B]).b2bPublished).toEqual([false]);
    const published = node({
      resourcePublicationsV2: { nodes: [{ publication: { id: B2B } }] },
    });
    expect(productFromGraphql(published, [B2B, ONLINE_STORE]).b2bPublished).toEqual([true, false]);
    expect(productFromGraphql(published, []).b2bPublished).toEqual([]);
  });

  it("scores the same gaps the audit reports", () => {
    const result = evaluateProduct(productFromGraphql(node(), [B2B]));
    const failed = result.results.filter((r) => !r.passed).map((r) => r.ruleId);
    expect(failed).toEqual([
      "guaranteed-analysis",
      "ingredients",
      "calories",
      "classification",
      "image-alt",
      "b2b-catalog",
      "seo",
      "sku",
    ]);
    expect(result.score).toBe(10);
  });
});
