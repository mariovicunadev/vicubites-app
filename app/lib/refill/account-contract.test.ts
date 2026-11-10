import { describe, expect, it } from "vitest";

import * as accountView from "../../../extensions/refill-account/src/forecast-view";
import { DUE_SOON_DAYS, isDueSoon, withVariants, type Forecast } from "./forecast";

/**
 * Contract between the app and the customer account page: the page parses
 * exactly what the app writes to `refill_forecast`, and both agree on what
 * "due soon" means.
 */
describe("customer account page reads the app's forecast metafield", () => {
  const forecasts: Forecast[] = [
    { species: "cat", basis: "estimate", daysOfFood: 30, lastOrderOn: "2026-10-12", runOutOn: "2026-11-11" },
    { species: "dog", basis: "cadence", daysOfFood: 60, lastOrderOn: "2026-10-01", runOutOn: "2026-11-30" },
  ];
  const written = JSON.stringify(withVariants(forecasts, new Map([["dog", "gid://shopify/ProductVariant/42"]])));

  it("keeps every species, date and variant", () => {
    expect(accountView.parseForecasts(written)).toEqual([
      { species: "cat", daysOfFood: 30, lastOrderOn: "2026-10-12", runOutOn: "2026-11-11", variantId: null },
      { species: "dog", daysOfFood: 60, lastOrderOn: "2026-10-01", runOutOn: "2026-11-30", variantId: "gid://shopify/ProductVariant/42" },
    ]);
  });

  it("uses the same due soon window", () => {
    expect(accountView.DUE_SOON_DAYS).toBe(DUE_SOON_DAYS);
    for (const today of ["2026-10-20", "2026-10-28", "2026-11-11", "2026-11-25"]) {
      const cards = accountView.toCards(accountView.parseForecasts(written), today, "https://shop.example");
      for (const card of cards) expect(card.dueSoon).toBe(isDueSoon(card, today));
    }
  });
});
