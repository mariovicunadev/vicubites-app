import { describe, expect, it } from "vitest";

import { parseForecasts, remindersOn, reorderUrl, toCards, type ForecastEntry } from "./forecast-view";

const SHOP = "https://vicubites.myshopify.com";
const dog: ForecastEntry = {
  species: "dog",
  daysOfFood: 60,
  lastOrderOn: "2026-10-01",
  runOutOn: "2026-11-30",
  variantId: "gid://shopify/ProductVariant/42",
};
const cat: ForecastEntry = { species: "cat", daysOfFood: 30, lastOrderOn: "2026-10-12", runOutOn: "2026-11-11", variantId: null };

describe("parseForecasts", () => {
  it("reads the app's forecast JSON", () => {
    expect(parseForecasts(JSON.stringify([{ ...dog, basis: "cadence" }]))).toEqual([dog]);
  });

  it("treats a missing variant as none", () => {
    expect(parseForecasts(JSON.stringify([{ ...cat, variantId: undefined }]))).toEqual([cat]);
  });

  it("drops malformed entries and never throws", () => {
    expect(parseForecasts(null)).toEqual([]);
    expect(parseForecasts("not json")).toEqual([]);
    expect(parseForecasts("{}")).toEqual([]);
    expect(
      parseForecasts(JSON.stringify([{ ...dog, species: "bird" }, { ...dog, runOutOn: "soon" }, null, cat])),
    ).toEqual([cat]);
  });
});

describe("reorderUrl", () => {
  it("builds a cart permalink for the variant", () => {
    expect(reorderUrl(SHOP, "gid://shopify/ProductVariant/42")).toBe(`${SHOP}/cart/42:1`);
    expect(reorderUrl(`${SHOP}/`, "gid://shopify/ProductVariant/42")).toBe(`${SHOP}/cart/42:1`);
  });

  it("returns null without a usable variant or shop URL", () => {
    expect(reorderUrl(SHOP, null)).toBeNull();
    expect(reorderUrl(SHOP, "gid://shopify/Product/42")).toBeNull();
    expect(reorderUrl("", "gid://shopify/ProductVariant/42")).toBeNull();
  });
});

describe("toCards", () => {
  it("sorts by run-out date and flags due soon", () => {
    const cards = toCards([dog, cat], "2026-11-09", SHOP);
    expect(cards.map((card) => [card.species, card.daysLeft, card.dueSoon, card.reorderUrl])).toEqual([
      ["cat", 2, true, null],
      ["dog", 21, false, `${SHOP}/cart/42:1`],
    ]);
  });

  it("counts overdue forecasts as due soon", () => {
    expect(toCards([cat], "2026-11-20", SHOP)[0]).toMatchObject({ daysLeft: -9, dueSoon: true });
  });
});

describe("remindersOn", () => {
  it("is on unless the customer turned it off", () => {
    expect(remindersOn(undefined)).toBe(true);
    expect(remindersOn("true")).toBe(true);
    expect(remindersOn("false")).toBe(false);
  });
});
