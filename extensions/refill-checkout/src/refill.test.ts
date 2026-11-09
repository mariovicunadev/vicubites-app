import { describe, expect, it } from "vitest";

import { bagGrams, hasDryFood, isDryFoodLine, remindersChecked, sameResource, type AppMetafieldEntry } from "./refill";

const DOG_FOOD = "gid://shopify/Product/1";
const TREATS = "gid://shopify/Product/2";

function productField(productId: string, key: string, value: string): AppMetafieldEntry {
  return { target: { type: "product", id: productId }, metafield: { namespace: "custom", key, value } };
}

function reminders(type: string, value: string): AppMetafieldEntry {
  return { target: { type, id: "gid://shopify/Cart/1" }, metafield: { namespace: "$app", key: "refill_reminders", value } };
}

const catalog: AppMetafieldEntry[] = [
  productField(DOG_FOOD, "species", "Dog"),
  productField(DOG_FOOD, "kcal_per_kg", "3600"),
  productField(TREATS, "species", "Dog"),
  productField(TREATS, "kcal_per_kg", "3300"),
];

const dryBag = { productId: DOG_FOOD, options: [{ name: "Size", value: "7 kg" }] };
const treatBag = { productId: TREATS, options: [{ name: "Flavor", value: "Chicken" }] };

describe("bagGrams", () => {
  it("reads kilos and grams", () => {
    expect(bagGrams("7 kg")).toBe(7000);
    expect(bagGrams("1.5 kg")).toBe(1500);
    expect(bagGrams("500 g")).toBe(500);
    expect(bagGrams("12 cans")).toBeNull();
  });
});

describe("dry food detection", () => {
  it("needs a bag size, a dog or cat species and calories", () => {
    expect(isDryFoodLine(dryBag, catalog)).toBe(true);
    expect(isDryFoodLine(treatBag, catalog)).toBe(false);
    expect(isDryFoodLine(dryBag, catalog.filter(({ metafield }) => metafield.key !== "kcal_per_kg"))).toBe(false);
    expect(isDryFoodLine(dryBag, [productField(DOG_FOOD, "species", "Bird"), productField(DOG_FOOD, "kcal_per_kg", "3600")])).toBe(
      false,
    );
  });

  it("matches metafield targets given as bare IDs, as checkout sends them", () => {
    const fromCheckout: AppMetafieldEntry[] = [
      { target: { type: "product", id: "9599873810670" }, metafield: { namespace: "custom", key: "species", value: "Dog" } },
      { target: { type: "product", id: "9599873810670" }, metafield: { namespace: "custom", key: "kcal_per_kg", value: "3700" } },
    ];
    const line = { productId: "gid://shopify/Product/9599873810670", options: [{ name: "Size", value: "7 kg" }] };
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
