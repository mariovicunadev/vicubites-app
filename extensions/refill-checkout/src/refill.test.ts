import { describe, expect, it } from "vitest";

import { bagGramsFrom, hasDryFood, isDryFoodLine, remindersChecked, sameResource, type AppMetafieldEntry } from "./refill";

const DOG_FOOD = "gid://shopify/Product/1";
const TREATS = "gid://shopify/Product/2";
const DOG_BAG = "gid://shopify/ProductVariant/11";
const TREAT_PACK = "gid://shopify/ProductVariant/21";
const DOG = "gid://shopify/Metaobject/101";

function field(type: string, id: string, key: string, value: string): AppMetafieldEntry {
  return { target: { type, id }, metafield: { namespace: "custom", key, value } };
}

function reminders(type: string, value: string): AppMetafieldEntry {
  return { target: { type, id: "gid://shopify/Cart/1" }, metafield: { namespace: "$app", key: "refill_reminders", value } };
}

const catalog: AppMetafieldEntry[] = [
  field("product", DOG_FOOD, "species", DOG),
  field("product", DOG_FOOD, "kcal_per_kg", "3600"),
  field("variant", DOG_BAG, "bag_grams", "7000"),
  field("product", TREATS, "species", DOG),
  field("product", TREATS, "kcal_per_kg", "3300"),
];

const dryBag = { productId: DOG_FOOD, variantId: DOG_BAG };
const treatBag = { productId: TREATS, variantId: TREAT_PACK };

describe("bagGramsFrom", () => {
  it("reads positive integer grams only", () => {
    expect(bagGramsFrom("7000")).toBe(7000);
    expect(bagGramsFrom("1500")).toBe(1500);
    expect(bagGramsFrom("0")).toBeNull();
    expect(bagGramsFrom("1.5 kg")).toBeNull();
    expect(bagGramsFrom(null)).toBeNull();
  });
});

describe("dry food detection", () => {
  it("needs a bag weight, a species reference and calories", () => {
    expect(isDryFoodLine(dryBag, catalog)).toBe(true);
    expect(isDryFoodLine(treatBag, catalog)).toBe(false);
    expect(isDryFoodLine(dryBag, catalog.filter(({ metafield }) => metafield.key !== "kcal_per_kg"))).toBe(false);
    expect(isDryFoodLine(dryBag, catalog.filter(({ metafield }) => metafield.key !== "species"))).toBe(false);
  });

  it("never reads translated text: a species label or a Size option does not count", () => {
    const translated = [
      field("product", DOG_FOOD, "species", "Perro"),
      field("product", DOG_FOOD, "kcal_per_kg", "3600"),
      field("variant", DOG_BAG, "bag_grams", "7000"),
    ];
    expect(isDryFoodLine(dryBag, translated)).toBe(false);
  });

  it("matches metafield targets given as bare IDs, as checkout sends them", () => {
    const fromCheckout: AppMetafieldEntry[] = [
      field("product", "9599873810670", "species", DOG),
      field("product", "9599873810670", "kcal_per_kg", "3700"),
      field("variant", "52001", "bag_grams", "7000"),
    ];
    const line = { productId: "gid://shopify/Product/9599873810670", variantId: "gid://shopify/ProductVariant/52001" };
    expect(isDryFoodLine(line, fromCheckout)).toBe(true);
  });

  it("finds dry food anywhere in the cart", () => {
    expect(hasDryFood([treatBag, dryBag], catalog)).toBe(true);
    expect(hasDryFood([treatBag], catalog)).toBe(false);
    expect(hasDryFood([], catalog)).toBe(false);
  });
});

describe("sameResource", () => {
  it("compares GIDs and bare IDs", () => {
    expect(sameResource("gid://shopify/Product/1", "1")).toBe(true);
    expect(sameResource("gid://shopify/Product/1", "gid://shopify/Product/1")).toBe(true);
    expect(sameResource("gid://shopify/Product/1", "11")).toBe(false);
  });
});

describe("remindersChecked", () => {
  it("defaults to on", () => {
    expect(remindersChecked(catalog)).toBe(true);
  });

  it("shows the signed-in customer's saved choice", () => {
    expect(remindersChecked([reminders("customer", "false")])).toBe(false);
  });

  it("prefers the choice made in this checkout", () => {
    expect(remindersChecked([reminders("customer", "false"), reminders("cart", "true")])).toBe(true);
    expect(remindersChecked([reminders("cart", "false")])).toBe(false);
  });

  it("accepts boolean values as well as strings", () => {
    expect(remindersChecked([{ ...reminders("cart", ""), metafield: { ...reminders("cart", "").metafield, value: false } }])).toBe(
      false,
    );
  });
});
