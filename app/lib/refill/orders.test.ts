import { describe, expect, it } from "vitest";

import type { BulkNode } from "../bulk/jsonl";
import { orderFromBulkNode, orderFromQuery, purchasesFromOrder, type OrderData, type OrderLine } from "./orders";

const DRY_DOG: OrderLine = { quantity: 1, options: { Size: "7 kg" }, species: "Dog", kcalPerKg: "3700" };
const DRY_CAT: OrderLine = { quantity: 2, options: { Size: "1.5 kg" }, species: "Cat", kcalPerKg: "3900" };
const WET_DOG: OrderLine = { quantity: 1, options: { Flavor: "Chicken", Pack: "12 cans" }, species: "Dog", kcalPerKg: "1000" };
const TREATS: OrderLine = { quantity: 2, options: { Flavor: "Chicken" }, species: "Dog", kcalPerKg: "3300" };

function order(lines: OrderLine[], overrides: Partial<OrderData> = {}): OrderData {
  return {
    id: "gid://shopify/Order/1",
    processedAt: "2026-10-14T10:00:00Z",
    customerId: "gid://shopify/Customer/1",
    isCompanyPurchase: false,
    lines,
    ...overrides,
  };
}

describe("purchasesFromOrder", () => {
  it("keeps dry food and skips wet food and treats", () => {
    expect(purchasesFromOrder(order([DRY_DOG, WET_DOG, TREATS]))).toEqual([
      { orderId: "gid://shopify/Order/1", processedAt: "2026-10-14T10:00:00Z", species: "dog", kcal: 25_900 },
    ]);
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
    selectedOptions: [{ name: "Size", value: "7 kg" }],
    product: { species: { value: "Dog" }, kcalPerKg: { value: "3700" } },
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
    expect(fromQuery).toMatchObject({ customerId: null, isCompanyPurchase: true });
  });
});
