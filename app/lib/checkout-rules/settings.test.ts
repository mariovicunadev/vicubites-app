import { describe, expect, it } from "vitest";

import { parseOrderLimitConfig } from "../../../extensions/order-limit/src/order-limit";
import { parseRefillRewardConfig } from "../../../extensions/refill-reward/src/refill-reward";
import {
  RANGES,
  readOrderLimitSettings,
  readRefillRewardSettings,
  validateOrderLimitForm,
  validateRefillRewardForm,
} from "./settings";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("validateRefillRewardForm", () => {
  it("accepts whole numbers in range, trimming spaces", () => {
    expect(validateRefillRewardForm(form({ percentage: " 10 ", windowDays: "14" }))).toEqual({
      ok: true,
      value: { percentage: 10, windowDays: 14 },
    });
  });

  it("reports every invalid field", () => {
    expect(validateRefillRewardForm(form({ percentage: "51", windowDays: "0" }))).toEqual({
      ok: false,
      fieldErrors: {
        percentage: "Discount must be a whole number from 1 to 50.",
        windowDays: "Window must be a whole number from 1 to 60.",
      },
    });
  });

  it.each([["2.5"], ["-3"], ["1e1"], ["ten"], [""]])("rejects %j", (raw) => {
    const result = validateRefillRewardForm(form({ percentage: raw, windowDays: "14" }));
    expect(result.ok).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(validateRefillRewardForm(new FormData()).ok).toBe(false);
  });
});

describe("validateOrderLimitForm", () => {
  it("accepts the range edges", () => {
    expect(validateOrderLimitForm(form({ maxPerVariant: "1" }))).toEqual({ ok: true, value: { maxPerVariant: 1 } });
    expect(validateOrderLimitForm(form({ maxPerVariant: "99" }))).toEqual({ ok: true, value: { maxPerVariant: 99 } });
  });

  it("rejects a value over the range with a field error", () => {
    expect(validateOrderLimitForm(form({ maxPerVariant: "100" }))).toEqual({
      ok: false,
      fieldErrors: { maxPerVariant: "Limit must be a whole number from 1 to 99." },
    });
  });
});

describe("reading stored settings", () => {
  it("returns valid settings and null for anything else", () => {
    expect(readRefillRewardSettings({ percentage: 10, windowDays: 14 })).toEqual({ percentage: 10, windowDays: 14 });
    expect(readRefillRewardSettings({ percentage: 10 })).toBeNull();
    expect(readRefillRewardSettings(null)).toBeNull();
    expect(readOrderLimitSettings({ maxPerVariant: 6 })).toEqual({ maxPerVariant: 6 });
    expect(readOrderLimitSettings({ maxPerVariant: "6" })).toBeNull();
  });
});

/** What the app saves, the Functions must accept, and nothing outside it. */
describe("contract with the Functions", () => {
  const { percentage, windowDays, maxPerVariant } = RANGES;

  it("the refill reward Function accepts the range edges and rejects one past them", () => {
    expect(parseRefillRewardConfig({ percentage: percentage.min, windowDays: windowDays.min })).not.toBeNull();
    expect(parseRefillRewardConfig({ percentage: percentage.max, windowDays: windowDays.max })).not.toBeNull();
    expect(parseRefillRewardConfig({ percentage: percentage.max + 1, windowDays: 14 })).toBeNull();
    expect(parseRefillRewardConfig({ percentage: 10, windowDays: windowDays.max + 1 })).toBeNull();
  });

  it("the order limit Function accepts the range edges and rejects one past them", () => {
    expect(parseOrderLimitConfig({ maxPerVariant: maxPerVariant.min })).not.toBeNull();
    expect(parseOrderLimitConfig({ maxPerVariant: maxPerVariant.max })).not.toBeNull();
    expect(parseOrderLimitConfig({ maxPerVariant: maxPerVariant.max + 1 })).toBeNull();
    expect(parseOrderLimitConfig({ maxPerVariant: maxPerVariant.min - 1 })).toBeNull();
  });
});
