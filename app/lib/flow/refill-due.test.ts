import { describe, expect, it } from "vitest";

import { numericId, refillDuePayload } from "./refill-due";

describe("refillDuePayload", () => {
  it("maps a forecast to the trigger's field keys with a numeric customer ID", () => {
    expect(
      refillDuePayload({
        customerId: "gid://shopify/Customer/10474064838894",
        species: "dog",
        runOutOn: "2026-11-12",
        daysLeft: 8,
        basis: "cadence",
      }),
    ).toEqual({
      customer_id: 10474064838894,
      Species: "dog",
      "Run out date": "2026-11-12",
      "Days left": 8,
      "Forecast basis": "cadence",
    });
  });

  it("keeps negative days left for food that already ran out", () => {
    const payload = refillDuePayload({
      customerId: "gid://shopify/Customer/1",
      species: "cat",
      runOutOn: "2026-11-01",
      daysLeft: -3,
      basis: "estimate",
    });
    expect(payload["Days left"]).toBe(-3);
  });

  it("sends nothing but the customer reference and forecast fields", () => {
    const payload = refillDuePayload({
      customerId: "gid://shopify/Customer/1",
      species: "cat",
      runOutOn: "2026-11-01",
      daysLeft: 0,
      basis: "estimate",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["Days left", "Forecast basis", "Run out date", "Species", "customer_id"].sort(),
    );
  });
});

describe("numericId", () => {
  it("reads the numeric ID of a GID", () => {
    expect(numericId("gid://shopify/Customer/42")).toBe(42);
  });

  it("rejects a value without an ID", () => {
    expect(() => numericId("gid://shopify/Customer/")).toThrow();
  });
});
