import { describe, expect, it } from "vitest";

import { csvField } from "../bulk/csv";
import type { BulkNode } from "../bulk/jsonl";
import { catalogCsv } from "./export";

function node(record: BulkNode["record"], children: BulkNode["children"] = {}): BulkNode {
  return { record, children };
}

const product = node(
  {
    id: "gid://shopify/Product/1",
    handle: "puppy-chicken",
    title: 'Puppy Chicken, "Oat" Recipe',
    status: "ACTIVE",
    productType: "Dry food",
    vendor: "Vicubites",
  },
  {
    ProductVariant: [
      node({ id: "gid://shopify/ProductVariant/10", title: "2 kg", sku: "VB-020", price: "23.99" }),
      node({ id: "gid://shopify/ProductVariant/11", title: "7 kg", sku: "VB-070", price: "56.99" }),
    ],
    Metafield: [
      node({ id: "gid://shopify/Metafield/1", namespace: "custom", key: "protein_min", value: "30.0" }),
    ],
    MediaImage: [
      node({ id: "gid://shopify/MediaImage/1", alt: "Front of the bag" }),
      node({ id: "gid://shopify/MediaImage/2", alt: "" }),
    ],
  },
);

const bare = node(
  { id: "gid://shopify/Product/2", handle: "sample", title: "Sample", status: "DRAFT" },
  {
    Metafield: [
      node({ id: "gid://shopify/Metafield/2", namespace: "custom", key: "food_type", value: "Wet" }),
    ],
  },
);

describe("csvField", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(3)).toBe("3");
  });
});

describe("catalogCsv", () => {
  const lines = [...catalogCsv([product, bare])].map((line) => line.trimEnd());

  it("adds one sorted column per metafield found in the export", () => {
    expect(lines[0]).toBe(
      "product_id,handle,title,status,product_type,vendor,variant_id,variant_title,sku,price," +
        "media_count,media_missing_alt,custom.food_type,custom.protein_min",
    );
  });

  it("writes one row per variant and repeats the product columns", () => {
    expect(lines[1]).toBe(
      'gid://shopify/Product/1,puppy-chicken,"Puppy Chicken, ""Oat"" Recipe",ACTIVE,Dry food,' +
        "Vicubites,gid://shopify/ProductVariant/10,2 kg,VB-020,23.99,2,1,,30.0",
    );
    expect(lines[2]).toContain("gid://shopify/ProductVariant/11,7 kg,VB-070,56.99");
  });

  it("keeps products without variants as a single row", () => {
    expect(lines[3]).toBe("gid://shopify/Product/2,sample,Sample,DRAFT,,,,,,,0,0,Wet,");
    expect(lines).toHaveLength(4);
  });
});
