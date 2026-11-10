import { describe, expect, it } from "vitest";
import { LanguageCode } from "../generated/api";
import { orderLimitMessage, parseOrderLimitConfig, variantsOverLimit, type CartLine } from "./order-limit";

describe("parseOrderLimitConfig", () => {
  it("accepts an integer inside the range", () => {
    expect(parseOrderLimitConfig({ maxPerVariant: 6 })).toEqual({ maxPerVariant: 6 });
    expect(parseOrderLimitConfig({ maxPerVariant: 1 })).toEqual({ maxPerVariant: 1 });
    expect(parseOrderLimitConfig({ maxPerVariant: 99 })).toEqual({ maxPerVariant: 99 });
  });

  it.each([
    ["no value", undefined],
    ["null", null],
    ["a missing field", {}],
    ["zero", { maxPerVariant: 0 }],
    ["over 99", { maxPerVariant: 100 }],
    ["a decimal", { maxPerVariant: 2.5 }],
    ["a numeric string", { maxPerVariant: "6" }],
  ])("rejects %s", (_label, value) => {
    expect(parseOrderLimitConfig(value)).toBeNull();
  });
});

describe("variantsOverLimit", () => {
  const line = (variantId: string, quantity: number, productTitle = "Adult Chicken Recipe"): CartLine => ({
    quantity,
    merchandise: { __typename: "ProductVariant", id: variantId, product: { title: productTitle } },
  });
  const over = (variantId: string, quantity: number, productTitle = "Adult Chicken Recipe") => ({
    variantId,
    productTitle,
    quantity,
  });

  it("returns only variants over the limit, in cart order", () => {
    expect(
      variantsOverLimit([line("v1", 7, "Puppy Salmon"), line("v2", 6), line("v3", 9, "Senior Lamb")], 6),
    ).toEqual([over("v1", 7, "Puppy Salmon"), over("v3", 9, "Senior Lamb")]);
  });

  it("adds up a variant split across several lines", () => {
    expect(variantsOverLimit([line("v1", 4), line("v2", 1), line("v1", 3)], 6)).toEqual([over("v1", 7)]);
  });

  it("does not change the input lines", () => {
    const lines = [line("v1", 4), line("v1", 3)];
    variantsOverLimit(lines, 6);
    expect(lines).toEqual([line("v1", 4), line("v1", 3)]);
  });

  it("skips lines that are not product variants", () => {
    const custom: CartLine = { quantity: 20, merchandise: { __typename: "CustomProduct" } };
    expect(variantsOverLimit([custom, line("v1", 2)], 6)).toEqual([]);
  });

  it("returns nothing for a cart within the limit", () => {
    expect(variantsOverLimit([line("v1", 6), line("v2", 1)], 6)).toEqual([]);
    expect(variantsOverLimit([], 6)).toEqual([]);
  });
});

describe("orderLimitMessage", () => {
  it("names the limit and the product", () => {
    expect(orderLimitMessage(6, "Adult Chicken Recipe", LanguageCode.En)).toBe(
      "Limit of 6 per order for Adult Chicken Recipe. For wholesale, contact us about a business account.",
    );
  });

  it("speaks Spanish to a Spanish checkout, with the localized title", () => {
    expect(orderLimitMessage(6, "Receta de pollo para adultos", LanguageCode.Es)).toBe(
      "Límite de 6 por pedido para Receta de pollo para adultos. " +
        "Para compras al por mayor, contáctanos para abrir una cuenta de empresa.",
    );
  });

  it("falls back to English for other languages", () => {
    expect(orderLimitMessage(6, "Adult Chicken Recipe", LanguageCode.Fr)).toMatch(/^Limit of 6 per order/);
  });
});
