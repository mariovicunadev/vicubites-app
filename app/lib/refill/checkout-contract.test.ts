import { describe, expect, it } from "vitest";

import { isDryFoodLine, type AppMetafieldEntry } from "../../../extensions/refill-checkout/src/refill";
import { purchasesFromOrder, type OrderLine } from "./orders";

/**
 * Contract between the checkout block and the forecast: the block shows the
 * reminder choice exactly for the lines the forecast counts as dry food.
 */
const lines: OrderLine[] = [
  { quantity: 1, variantId: "v1", options: { Size: "7 kg" }, species: "Dog", kcalPerKg: "3600" },
  { quantity: 1, variantId: "v2", options: { Size: "500 g" }, species: "cat", kcalPerKg: "3900" },
  { quantity: 1, variantId: "v3", options: { Pack: "12 cans" }, species: "Dog", kcalPerKg: "1000" },
  { quantity: 1, variantId: "v4", options: { Flavor: "Chicken" }, species: "Dog", kcalPerKg: "3300" },
  { quantity: 1, variantId: "v5", options: { Size: "7 kg" }, species: null, kcalPerKg: "3600" },
  { quantity: 1, variantId: "v6", options: { Size: "7 kg" }, species: "Dog", kcalPerKg: null },
  { quantity: 1, variantId: "v7", options: { Size: "2 kg" }, species: "Bird", kcalPerKg: "3600" },
];

function checkoutView(line: OrderLine, index: number) {
  const productId = `gid://shopify/Product/${index}`;
  const metafields: AppMetafieldEntry[] = [];
  for (const [key, value] of [
    ["species", line.species],
    ["kcal_per_kg", line.kcalPerKg],
  ] as const) {
    if (value !== null) metafields.push({ target: { type: "product", id: productId }, metafield: { namespace: "custom", key, value } });
  }
  const options = Object.entries(line.options).map(([name, value]) => ({ name, value }));
  return { line: { productId, options }, metafields };
}

describe("checkout block and forecast agree on dry food", () => {
  it.each(lines.map((line, index) => [line.variantId, line, index] as const))("line %s", (_, line, index) => {
    const order = {
      id: "o",
      processedAt: "2026-11-09T10:00:00Z",
      customerId: "c",
      isCompanyPurchase: false,
      refillReminders: null,
      lines: [line],
    };
    const { line: checkoutLine, metafields } = checkoutView(line, index);
    expect(isDryFoodLine(checkoutLine, metafields)).toBe(purchasesFromOrder(order).length > 0);
  });
});
