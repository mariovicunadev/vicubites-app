import { describe, expect, it } from "vitest";
import { daysBetween, isDryFood, isRefillDue, parseRefillRewardConfig } from "./refill-reward";

describe("parseRefillRewardConfig", () => {
  it("accepts integers inside both ranges", () => {
    expect(parseRefillRewardConfig({ percentage: 10, windowDays: 14 })).toEqual({
      percentage: 10,
      windowDays: 14,
    });
    expect(parseRefillRewardConfig({ percentage: 50, windowDays: 1 })).toEqual({
      percentage: 50,
      windowDays: 1,
    });
  });

  it.each([
    ["no value", undefined],
    ["null", null],
    ["a string", '{"percentage":10,"windowDays":14}'],
    ["a missing field", { percentage: 10 }],
    ["a zero percentage", { percentage: 0, windowDays: 14 }],
    ["a percentage over 50", { percentage: 51, windowDays: 14 }],
    ["a decimal percentage", { percentage: 10.5, windowDays: 14 }],
    ["a numeric string", { percentage: "10", windowDays: 14 }],
    ["a window over 60 days", { percentage: 10, windowDays: 61 }],
  ])("rejects %s", (_label, value) => {
    expect(parseRefillRewardConfig(value)).toBeNull();
  });
});

describe("daysBetween", () => {
  it("counts calendar days in both directions", () => {
    expect(daysBetween("2026-11-07", "2026-11-21")).toBe(14);
    expect(daysBetween("2026-11-21", "2026-11-07")).toBe(-14);
    expect(daysBetween("2026-11-07", "2026-11-07")).toBe(0);
  });

  it("crosses month, year and leap day boundaries", () => {
    expect(daysBetween("2026-12-25", "2027-01-08")).toBe(14);
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("returns null for malformed dates", () => {
    expect(daysBetween("2026-11-07T00:00:00Z", "2026-11-21")).toBeNull();
    expect(daysBetween("2026-11-07", "soon")).toBeNull();
  });
});

describe("isRefillDue", () => {
  const today = "2026-11-07";

  it("is due inside the window before or after the run-out date", () => {
    expect(isRefillDue("2026-11-21", today, 14)).toBe(true);
    expect(isRefillDue("2026-10-24", today, 14)).toBe(true);
    expect(isRefillDue(today, today, 1)).toBe(true);
  });

  it("is not due outside the window or with a malformed date", () => {
    expect(isRefillDue("2026-11-22", today, 14)).toBe(false);
    expect(isRefillDue("2026-10-23", today, 14)).toBe(false);
    expect(isRefillDue("", today, 14)).toBe(false);
  });
});

describe("isDryFood", () => {
  it("accepts the dry food product types", () => {
    expect(isDryFood("Dry Dog Food")).toBe(true);
    expect(isDryFood("Dry Cat Food")).toBe(true);
  });

  it.each([["Wet Dog Food"], ["Wet Cat Food"], ["Dog Treats"], ["Cat Treats"], [""], [null], [undefined]])(
    "rejects %j",
    (productType) => {
      expect(isDryFood(productType)).toBe(false);
    },
  );
});
