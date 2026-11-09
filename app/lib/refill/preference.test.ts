import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  refillPreference: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), count: vi.fn() },
}));
const adminGraphql = vi.hoisted(() => vi.fn());

vi.mock("../../db.server", () => ({ default: db }));
vi.mock("../admin/graphql.server", () => ({ adminGraphql }));

import type { OrderData } from "./orders";
import { optedOutCustomers, recordPreference } from "./preference.server";

const shop = "vicubites.myshopify.com";
const graphql = vi.fn() as never;
const order: OrderData = {
  id: "gid://shopify/Order/2",
  processedAt: "2026-11-09T10:00:00Z",
  customerId: "gid://shopify/Customer/1",
  isCompanyPurchase: false,
  refillReminders: false,
  lines: [],
};

describe("recordPreference", () => {
  beforeEach(() => {
    db.refillPreference.findUnique.mockResolvedValue(null);
    db.refillPreference.upsert.mockResolvedValue({});
    adminGraphql.mockResolvedValue({ metafieldsSet: { metafields: [{ key: "refill_reminders" }], userErrors: [] } });
  });
  afterEach(() => vi.clearAllMocks());

  it("stores the choice and mirrors it to the customer metafield", async () => {
    expect(await recordPreference(graphql, shop, order)).toBe(true);
    expect(db.refillPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ customerId: order.customerId, reminders: false, orderId: order.id }),
      }),
    );
    const [, , { variables }] = adminGraphql.mock.calls[0];
    expect(variables.metafields).toEqual([
      { ownerId: order.customerId, namespace: "$app", key: "refill_reminders", type: "boolean", value: "false" },
    ]);
  });

  it("does nothing when the order carries no choice or no customer", async () => {
    expect(await recordPreference(graphql, shop, { ...order, refillReminders: null })).toBe(false);
    expect(await recordPreference(graphql, shop, { ...order, customerId: null })).toBe(false);
    expect(db.refillPreference.upsert).not.toHaveBeenCalled();
    expect(adminGraphql).not.toHaveBeenCalled();
  });

  it("keeps a choice from a newer order when an older order's webhook arrives late", async () => {
    db.refillPreference.findUnique.mockResolvedValue({ decidedAt: new Date("2026-11-10T08:00:00Z") });
    expect(await recordPreference(graphql, shop, { ...order, refillReminders: true })).toBe(false);
    expect(db.refillPreference.upsert).not.toHaveBeenCalled();
  });

  it("fails loudly when the metafield write is rejected", async () => {
    adminGraphql.mockResolvedValue({ metafieldsSet: { metafields: [], userErrors: [{ field: null, message: "Bad" }] } });
    await expect(recordPreference(graphql, shop, order)).rejects.toThrow();
  });
});

describe("optedOutCustomers", () => {
  afterEach(() => vi.clearAllMocks());

  it("skips the query for an empty list", async () => {
    expect(await optedOutCustomers(shop, [])).toEqual(new Set());
    expect(db.refillPreference.findMany).not.toHaveBeenCalled();
  });

  it("returns the customers with reminders off", async () => {
    db.refillPreference.findMany.mockResolvedValue([{ customerId: "gid://shopify/Customer/1" }]);
    expect(await optedOutCustomers(shop, ["gid://shopify/Customer/1", "gid://shopify/Customer/2"])).toEqual(
      new Set(["gid://shopify/Customer/1"]),
    );
  });
});
