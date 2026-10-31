import { describe, expect, it } from "vitest";

import {
  assembleTree,
  gidType,
  parseJsonl,
  splitLines,
  type BulkRecord,
} from "./jsonl";

async function* from<T>(items: readonly T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

const PRODUCT = "gid://shopify/Product/1";

describe("gidType", () => {
  it("reads the resource type from a GID", () => {
    expect(gidType("gid://shopify/ProductVariant/42")).toBe("ProductVariant");
  });

  it("rejects values that aren't GIDs", () => {
    expect(() => gidType("42")).toThrow("Not a Shopify GID");
  });
});

describe("splitLines", () => {
  it("joins lines split across chunks and keeps a last line without newline", async () => {
    const lines = await collect(splitLines(from(['{"a":', '1}\n{"b"', ":2}"])));

    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe("parseJsonl", () => {
  it("skips blank lines", async () => {
    const records = await collect(parseJsonl(from(['{"id":"x"}', "", "  "])));

    expect(records).toEqual([{ id: "x" }]);
  });

  it("reports the line number of invalid JSON", async () => {
    await expect(collect(parseJsonl(from(['{"id":"x"}', "{oops"])))).rejects.toThrow(
      "Invalid JSONL at line 2",
    );
  });
});

describe("assembleTree", () => {
  it("groups children under their parent by resource type", async () => {
    const records: BulkRecord[] = [
      { id: PRODUCT, title: "Puppy Chicken" },
      { id: "gid://shopify/ProductVariant/10", __parentId: PRODUCT },
      { id: "gid://shopify/Metafield/20", __parentId: PRODUCT },
      { id: "gid://shopify/ProductVariant/11", __parentId: PRODUCT },
    ];

    const [product] = await assembleTree(from(records));

    expect(product.record.title).toBe("Puppy Chicken");
    expect(product.children.ProductVariant.map((n) => n.record.id)).toEqual([
      "gid://shopify/ProductVariant/10",
      "gid://shopify/ProductVariant/11",
    ]);
    expect(product.children.Metafield).toHaveLength(1);
  });

  it("attaches children that arrive before their parent", async () => {
    const records: BulkRecord[] = [
      { id: "gid://shopify/ProductVariant/10", __parentId: PRODUCT },
      { id: PRODUCT },
    ];

    const roots = await assembleTree(from(records));

    expect(roots).toHaveLength(1);
    expect(roots[0].children.ProductVariant).toHaveLength(1);
  });

  it("keeps roots in file order", async () => {
    const roots = await assembleTree(
      from([{ id: "gid://shopify/Product/2" }, { id: "gid://shopify/Product/1" }]),
    );

    expect(roots.map((n) => n.record.id)).toEqual([
      "gid://shopify/Product/2",
      "gid://shopify/Product/1",
    ]);
  });

  it("fails when a child's parent never appears", async () => {
    await expect(
      assembleTree(from([{ id: "gid://shopify/ProductVariant/10", __parentId: PRODUCT }])),
    ).rejects.toThrow("children without a parent");
  });
});
