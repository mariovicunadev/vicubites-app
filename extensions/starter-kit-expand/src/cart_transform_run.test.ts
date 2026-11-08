import { describe, expect, it } from "vitest";
import type { CartTransformRunInput } from "../generated/api";
import { cartTransformRun } from "./cart_transform_run";
import { VALID_CONFIG } from "./test-fixtures";

type Line = CartTransformRunInput["cart"]["lines"][number];

const KIT = VALID_CONFIG.kitVariantId;

function line(
  id: string,
  variantId: string,
  { recipe = null as string | null, treat = null as string | null, price = "28.79" } = {},
): Line {
  return {
    id,
    recipe: recipe === null ? null : { value: recipe },
    treat: treat === null ? null : { value: treat },
    cost: { amountPerQuantity: { amount: price } },
    merchandise: { __typename: "ProductVariant", id: variantId },
  };
}

function input(lines: Line[], config: unknown = VALID_CONFIG): CartTransformRunInput {
  return {
    cart: { lines },
    cartTransform: { config: config === null ? null : { jsonValue: config } },
  };
}

/** The expanded variants and prices of each operation, for short assertions. */
function expanded(result: ReturnType<typeof cartTransformRun>) {
  return result.operations.map((operation) => ({
    line: operation.lineExpand!.cartLineId,
    items: operation.lineExpand!.expandedCartItems.map((item) => [
      item.merchandiseId,
      item.quantity,
      item.price?.adjustment.fixedPricePerUnit?.amount,
    ]),
  }));
}

describe("cartTransformRun", () => {
  it("expands the kit into the chosen recipe and treat", () => {
    const result = cartTransformRun(input([line("L1", KIT, { recipe: "salmon", treat: "tuna" })]));
    expect(expanded(result)).toEqual([
      {
        line: "L1",
        items: [
          ["gid://shopify/ProductVariant/202", 1, "22.71"],
          ["gid://shopify/ProductVariant/302", 1, "6.08"],
        ],
      },
    ]);
  });

  it("keeps the kit price: the parts add up to the line's unit price", () => {
    const result = cartTransformRun(input([line("L1", KIT, { recipe: "salmon", treat: "tuna", price: "28.79" })]));
    const sum = result.operations[0].lineExpand!.expandedCartItems
      .reduce((total, item) => total + Math.round(Number(item.price!.adjustment.fixedPricePerUnit!.amount) * 100), 0);
    expect(sum).toBe(2879);
  });

  it("uses the defaults when the properties are missing or unknown", () => {
    const result = cartTransformRun(input([
      line("L1", KIT),
      line("L2", KIT, { recipe: "beef", treat: "duck" }),
    ]));
    for (const operation of expanded(result)) {
      expect(operation.items.map(([variant]) => variant)).toEqual([
        "gid://shopify/ProductVariant/201",
        "gid://shopify/ProductVariant/301",
      ]);
    }
  });

  it("expands each kit line with its own choices", () => {
    const result = cartTransformRun(input([
      line("L1", KIT, { recipe: "salmon", treat: "chicken" }),
      line("L2", KIT, { recipe: "chicken-rice", treat: "tuna" }),
    ]));
    expect(expanded(result).map((operation) => operation.items.map(([variant]) => variant))).toEqual([
      ["gid://shopify/ProductVariant/202", "gid://shopify/ProductVariant/301"],
      ["gid://shopify/ProductVariant/201", "gid://shopify/ProductVariant/302"],
    ]);
  });

  it("never touches lines that aren't the kit", () => {
    const custom: Line = {
      id: "L3",
      recipe: null,
      treat: null,
      cost: { amountPerQuantity: { amount: "5.00" } },
      merchandise: { __typename: "CustomProduct" },
    };
    const result = cartTransformRun(input([
      line("L1", "gid://shopify/ProductVariant/201", { recipe: "salmon" }),
      line("L2", KIT),
      custom,
    ]));
    expect(expanded(result).map((operation) => operation.line)).toEqual(["L2"]);
  });

  it("returns no operations without a kit line", () => {
    expect(cartTransformRun(input([line("L1", "gid://shopify/ProductVariant/201")]))).toEqual({ operations: [] });
  });

  it.each([
    ["missing", null],
    ["invalid", { kitVariantId: KIT }],
  ])("returns no operations when the configuration is %s", (_, config) => {
    expect(cartTransformRun(input([line("L1", KIT)], config))).toEqual({ operations: [] });
  });
});
