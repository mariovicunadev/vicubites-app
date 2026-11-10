import { describe, expect, it } from "vitest";

import type { BulkNode } from "../bulk/jsonl";
import {
  orderFromBulkNode,
  orderFromQuery,
  purchasesFromOrder,
  reminderChoice,
  type OrderData,
  type OrderLine,
} from "./orders";

const line = (variant: number, rest: Omit<OrderLine, "variantId">): OrderLine => ({
  variantId: `gid://shopify/ProductVariant/${variant}`,
  ...rest,
});
const DRY_DOG = line(1, { quantity: 1, bagGrams: "7000", species: "dog", kcalPerKg: "3700" });
const DRY_CAT = line(2, { quantity: 2, bagGrams: "1500", species: "cat", kcalPerKg: "3900" });
const WET_DOG = line(3, { quantity: 1, bagGrams: null, species: "dog", kcalPerKg: "1000" });
const TREATS = line(4, { quantity: 2, bagGrams: null, species: "dog", kcalPerKg: "3300" });

function order(lines: OrderLine[], overrides: Partial<OrderData> = {}): OrderData {
  return {
    id: "gid://shopify/Order/1",
    processedAt: "2026-10-14T10:00:00Z",
    customerId: "gid://shopify/Customer/1",
    isCompanyPurchase: false,
    refillReminders: null,
    lines,
    ...overrides,
  };
}

describe("purchasesFromOrder", () => {
  it("keeps dry food and skips wet food and treats", () => {
    expect(purchasesFromOrder(order([DRY_DOG, WET_DOG, TREATS]))).toEqual([
      {
        orderId: "gid://shopify/Order/1",
        processedAt: "2026-10-14T10:00:00Z",
        species: "dog",
        kcal: 25_900,
        variantId: "gid://shopify/ProductVariant/1",
      },
    ]);
  });

  it("adds up the bags of one species and keeps the biggest one's variant", () => {
    const smallBag = line(5, { quantity: 1, bagGrams: "2000", species: "dog", kcalPerKg: "3900" });
    const [purchase] = purchasesFromOrder(order([smallBag, DRY_DOG]));
    expect(purchase.kcal).toBe(7_800 + 25_900);
    expect(purchase.variantId).toBe("gid://shopify/ProductVariant/1");
  });

  it("gives one purchase per species and multiplies by quantity", () => {
    const purchases = purchasesFromOrder(order([DRY_DOG, DRY_CAT]));
    expect(purchases.map(({ species, kcal }) => [species, kcal])).toEqual([
      ["dog", 25_900],
      ["cat", 11_700],
    ]);
  });

  it("skips orders without a customer and B2B orders", () => {
    expect(purchasesFromOrder(order([DRY_DOG], { customerId: null }))).toEqual([]);
    expect(purchasesFromOrder(order([DRY_DOG], { isCompanyPurchase: true }))).toEqual([]);
  });

  it("skips lines with missing calories or species", () => {
    expect(purchasesFromOrder(order([{ ...DRY_DOG, kcalPerKg: null }, { ...DRY_CAT, species: null }]))).toEqual([]);
  });
});

const LINE_FIELDS = {
  quantity: 1,
  variant: {
    id: "gid://shopify/ProductVariant/1",
    bagGrams: { value: "7000" },
    product: { species: { reference: { handle: "dog" } }, kcalPerKg: { value: "3700" } },
  },
};

describe("order adapters", () => {
  it("read the same order from a bulk node and from the single-order query", () => {
    const fields = {
      id: "gid://shopify/Order/1",
      processedAt: "2026-10-14T10:00:00Z",
      customer: { id: "gid://shopify/Customer/1" },
      purchasingEntity: { __typename: "Customer" },
    };
    const node: BulkNode = {
      record: fields,
      children: {
        LineItem: [{ record: { id: "gid://shopify/LineItem/9", __parentId: fields.id, ...LINE_FIELDS }, children: {} }],
      },
    };

    const fromBulk = orderFromBulkNode(node);
    expect(fromBulk).toEqual(orderFromQuery({ ...fields, lineItems: { nodes: [LINE_FIELDS] } }));
    expect(fromBulk.lines).toEqual([DRY_DOG]);
  });

  it("flags company purchases and missing customers", () => {
    const fromQuery = orderFromQuery({
      id: "gid://shopify/Order/2",
      processedAt: "2026-10-14T10:00:00Z",
      customer: null,
      purchasingEntity: { __typename: "PurchasingCompany" },
      lineItems: { nodes: [] },
    });
    expect(fromQuery).toMatchObject({ customerId: null, isCompanyPurchase: true, refillReminders: null });
  });

  it("reads the buyer's reminder choice from the order metafield", () => {
    const base = { id: "gid://shopify/Order/3", processedAt: "2026-11-09T10:00:00Z", lineItems: { nodes: [] } };
    expect(orderFromQuery({ ...base, refillReminders: { value: "false" } }).refillReminders).toBe(false);
    expect(orderFromQuery({ ...base, refillReminders: { value: "true" } }).refillReminders).toBe(true);
    expect(orderFromQuery({ ...base, refillReminders: null }).refillReminders).toBeNull();
  });
});

describe("reminderChoice", () => {
  it("accepts only boolean metafield values", () => {
    expect(reminderChoice("true")).toBe(true);
    expect(reminderChoice("false")).toBe(false);
    expect(reminderChoice("no")).toBeNull();
    expect(reminderChoice(undefined)).toBeNull();
  });
});
