import { describe, expect, it } from "vitest";

import { dueLabel, toRefillRow } from "./view";

const TODAY = "2026-11-03";

function row(runOutOn: string) {
  return toRefillRow(
    { customerId: "gid://shopify/Customer/10463501877486", species: "dog", basis: "cadence", runOutOn },
    TODAY,
  );
}

describe("dueLabel", () => {
  it("says when the food runs out", () => {
    expect(dueLabel(9)).toBe("in 9 days");
    expect(dueLabel(1)).toBe("in 1 day");
    expect(dueLabel(0)).toBe("today");
    expect(dueLabel(-4)).toBe("4 days ago");
  });
});

describe("toRefillRow", () => {
  it("links the customer by numeric ID and labels the forecast", () => {
    expect(row("2026-11-12")).toMatchObject({
      adminId: "10463501877486",
      species: "Dog",
      basis: "Reorder cadence",
      daysLeft: 9,
      due: "in 9 days",
      tone: "caution",
      dueSoon: true,
    });
  });

  it("marks overdue forecasts critical and distant ones neutral", () => {
    expect(row("2026-10-30")).toMatchObject({ tone: "critical", dueSoon: true, due: "4 days ago" });
    expect(row("2026-12-09")).toMatchObject({ tone: "neutral", dueSoon: false });
  });
});
