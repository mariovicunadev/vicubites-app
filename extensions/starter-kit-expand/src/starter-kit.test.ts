import { describe, expect, it } from "vitest";
import { parseStarterKitConfig, resolveOption, splitPrice } from "./starter-kit";
import { VALID_CONFIG } from "./test-fixtures";

const cents = (amount: string) => Math.round(Number(amount) * 100);

describe("parseStarterKitConfig", () => {
  it("accepts a valid configuration", () => {
    expect(parseStarterKitConfig(VALID_CONFIG)).toEqual(VALID_CONFIG);
  });

  it.each([
    ["null", null],
    ["a string", "{}"],
    ["a bad kit variant id", { ...VALID_CONFIG, kitVariantId: "100" }],
    ["no recipes", { ...VALID_CONFIG, recipes: [] }],
    ["missing treats", { ...VALID_CONFIG, treats: undefined }],
    ["a default recipe that isn't an option", { ...VALID_CONFIG, defaultRecipe: "beef" }],
    ["a default treat that isn't an option", { ...VALID_CONFIG, defaultTreat: "beef" }],
    ["a zero weight", { ...VALID_CONFIG, treats: [{ ...VALID_CONFIG.treats[0], weight: 0 }] }],
    ["a product id instead of a variant id", {
      ...VALID_CONFIG,
      recipes: [{ ...VALID_CONFIG.recipes[0], variantId: "gid://shopify/Product/1" }],
    }],
    ["duplicate option values", {
      ...VALID_CONFIG,
      recipes: [VALID_CONFIG.recipes[0], VALID_CONFIG.recipes[0]],
    }],
  ])("rejects %s", (_, value) => {
    expect(parseStarterKitConfig(value)).toBeNull();
  });
});

describe("resolveOption", () => {
  const { recipes } = VALID_CONFIG;

  it("returns the chosen option", () => {
    expect(resolveOption(recipes, "salmon", "chicken-rice").value).toBe("salmon");
  });

  it.each([null, undefined, "", "beef"])("falls back to the default for %s", (chosen) => {
    expect(resolveOption(recipes, chosen, "chicken-rice").value).toBe("chicken-rice");
  });
});

describe("splitPrice", () => {
  it("splits in proportion to the weights", () => {
    expect(splitPrice("30.00", [2, 1])).toEqual(["20.00", "10.00"]);
  });

  it("always adds up to the kit price exactly", () => {
    for (const price of ["28.79", "0.01", "99.99", "29.7", "1000"]) {
      for (const weights of [[24.99, 6.99], [27.99, 7.49], [1, 1, 1]]) {
        const parts = splitPrice(price, weights);
        expect(parts).not.toBeNull();
        const sum = parts!.reduce((total, part) => total + cents(part), 0);
        expect(sum).toBe(cents(price));
      }
    }
  });

  it("gives the rounding remainder to the last part", () => {
    expect(splitPrice("10.00", [1, 1, 1])).toEqual(["3.33", "3.33", "3.34"]);
  });

  it("formats cents with two decimals", () => {
    expect(splitPrice("1.05", [1])).toEqual(["1.05"]);
    expect(splitPrice("0.10", [1, 1])).toEqual(["0.05", "0.05"]);
  });

  it.each([
    ["not a number", "abc", [1]],
    ["a negative price", "-1", [1]],
    ["no weights", "10", []],
  ])("returns null for %s", (_, price, weights) => {
    expect(splitPrice(price, weights)).toBeNull();
  });
});
