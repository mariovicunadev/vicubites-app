import { describe, expect, it } from "vitest";

import {
  addDays,
  daysBetween,
  daysLeft,
  forecastCustomer,
  forecastSpecies,
  isDueSoon,
  lastVariantBySpecies,
  median,
  speciesFrom,
  withVariants,
  type Forecast,
  type Purchase,
} from "./forecast";

function purchase(processedAt: string, overrides: Partial<Purchase> = {}): Purchase {
  return {
    orderId: `gid://shopify/Order/${processedAt}`,
    processedAt,
    species: "dog",
    kcal: 25_900,
    variantId: "gid://shopify/ProductVariant/1",
    ...overrides,
  };
}

describe("speciesFrom", () => {
  it("normalizes the metafield value", () => {
    expect(speciesFrom("dog")).toBe("dog");
    expect(speciesFrom("cat")).toBe("cat");
    // Labels are translated text, never keys
    expect(speciesFrom("Dog")).toBeNull();
    expect(speciesFrom("Perro")).toBeNull();
    expect(speciesFrom("bird")).toBeNull();
    expect(speciesFrom(null)).toBeNull();
  });
});

describe("dates", () => {
  it("adds and counts whole days in UTC", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(daysBetween("2026-11-03", "2026-10-30")).toBe(-4);
    expect(daysBetween("2026-02-27", "2026-03-01")).toBe(2);
  });

  it("takes the median of odd and even lists", () => {
    expect(median([26, 26])).toBe(26);
    expect(median([24, 23])).toBe(23.5);
    expect(median([30, 10, 20])).toBe(20);
  });
});

describe("forecastSpecies", () => {
  it("estimates the first order from calories and the reference daily intake", () => {
    // 7 kg × 3700 kcal/kg = 25,900 kcal ÷ 900 kcal/day ≈ 28.8 → 29 days
    const forecast = forecastSpecies([purchase("2026-10-14T10:00:00Z")]);
    expect(forecast).toEqual({
      species: "dog",
      basis: "estimate",
      daysOfFood: 29,
      lastOrderOn: "2026-10-14",
      runOutOn: "2026-11-12",
    });
  });

  it("uses the cat reference for cats", () => {
    // 4 kg × 4100 kcal/kg = 16,400 kcal ÷ 250 kcal/day ≈ 65.6 → 66 days
    const forecast = forecastSpecies([purchase("2026-10-04T00:00:00Z", { species: "cat", kcal: 16_400 })]);
    expect(forecast?.daysOfFood).toBe(66);
  });

  it("switches to the median interval with two or more orders", () => {
    const forecast = forecastSpecies([
      purchase("2026-10-31T09:00:00Z"),
      purchase("2026-09-14T09:00:00Z"),
      purchase("2026-10-08T09:00:00Z"),
    ]);
    // Intervals 24 and 23 → 23.5 → 24 days after the latest order
    expect(forecast).toMatchObject({ basis: "cadence", daysOfFood: 24, lastOrderOn: "2026-10-31", runOutOn: "2026-11-24" });
  });

  it("counts orders on the same day as one purchase", () => {
    const forecast = forecastSpecies([
      purchase("2026-10-14T08:00:00Z", { kcal: 9000 }),
      purchase("2026-10-14T18:00:00Z", { kcal: 9000 }),
    ]);
    // One purchase day of 18,000 kcal → 20 days, not a 0-day cadence
    expect(forecast).toMatchObject({ basis: "estimate", daysOfFood: 20 });
  });

  it("returns null without purchases", () => {
    expect(forecastSpecies([])).toBeNull();
  });
});

describe("forecastCustomer", () => {
  it("forecasts each species apart, earliest run-out first", () => {
    const forecasts = forecastCustomer([
      purchase("2026-10-04T00:00:00Z", { species: "cat", kcal: 16_400 }),
      purchase("2026-10-28T00:00:00Z", { kcal: 7800 }),
    ]);
    expect(forecasts.map((forecast) => [forecast.species, forecast.runOutOn])).toEqual([
      ["dog", "2026-11-06"],
      ["cat", "2026-12-09"],
    ]);
  });
});

describe("lastVariantBySpecies", () => {
  it("keeps the latest purchase's variant per species", () => {
    expect(
      lastVariantBySpecies([
        purchase("2026-10-28T00:00:00Z", { variantId: "gid://shopify/ProductVariant/2" }),
        purchase("2026-09-30T00:00:00Z"),
        purchase("2026-10-04T00:00:00Z", { species: "cat", variantId: "gid://shopify/ProductVariant/7" }),
      ]),
    ).toEqual(
      new Map([
        ["dog", "gid://shopify/ProductVariant/2"],
        ["cat", "gid://shopify/ProductVariant/7"],
      ]),
    );
  });

  it("falls back to an older purchase when the latest has no variant left", () => {
    expect(
      lastVariantBySpecies([purchase("2026-10-28T00:00:00Z", { variantId: null }), purchase("2026-09-30T00:00:00Z")]),
    ).toEqual(new Map([["dog", "gid://shopify/ProductVariant/1"]]));
  });
});

describe("withVariants", () => {
  const dog: Forecast = {
    species: "dog",
    basis: "estimate",
    daysOfFood: 30,
    lastOrderOn: "2026-10-28",
    runOutOn: "2026-11-27",
  };

  it("adds each species' last variant, or null when none is left", () => {
    const cat: Forecast = { ...dog, species: "cat" };
    expect(withVariants([dog, cat], new Map([["dog", "gid://shopify/ProductVariant/2"]]))).toEqual([
      { ...dog, variantId: "gid://shopify/ProductVariant/2" },
      { ...cat, variantId: null },
    ]);
  });
});

describe("due soon", () => {
  it("counts days left, negative once past", () => {
    expect(daysLeft({ runOutOn: "2026-11-12" }, "2026-11-03")).toBe(9);
    expect(daysLeft({ runOutOn: "2026-10-30" }, "2026-11-03")).toBe(-4);
  });

  it("includes forecasts within 14 days and overdue ones", () => {
    expect(isDueSoon({ runOutOn: "2026-11-17" }, "2026-11-03")).toBe(true);
    expect(isDueSoon({ runOutOn: "2026-11-18" }, "2026-11-03")).toBe(false);
    expect(isDueSoon({ runOutOn: "2026-10-30" }, "2026-11-03")).toBe(true);
  });
});
