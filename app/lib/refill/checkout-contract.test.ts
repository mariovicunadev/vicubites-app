import { describe, expect, it } from "vitest";

import { isDryFoodLine, type AppMetafieldEntry } from "../../../extensions/refill-checkout/src/refill";
import { purchasesFromOrder, type OrderLine } from "./orders";

/**
 * Contract between the checkout block and the forecast: the block shows the
 * reminder choice exactly for the lines the forecast counts as dry food.
 */
const lines: OrderLine[] = [
  { quantity: 1, variantId: "v1", bagGrams: "7000", species: "dog", kcalPerKg: "3600" },
  { quantity: 1, variantId: "v2", bagGrams: "500", species: "cat", kcalPerKg: "3900" },
  { quantity: 1, variantId: "v3", bagGrams: null, species: "dog", kcalPerKg: "1000" },
  { quantity: 1, variantId: "v4", bagGrams: null, species: "dog", kcalPerKg: "3300" },
  { quantity: 1, variantId: "v5", bagGrams: "7000", species: null, kcalPerKg: "3600" },
  { quantity: 1, variantId: "v6", bagGrams: "7000", species: "dog", kcalPerKg: null },
  { quantity: 1, variantId: "v7", bagGrams: "0", species: "cat", kcalPerKg: "3600" },
];

/** Checkout sees the species reference as the metaobject GID; the backend reads its handle. */
const SPECIES_GIDS: Record<string, string> = { dog: "gid://shopify/Metaobject/1", cat: "gid://shopify/Metaobject/2" };

function checkoutView(line: OrderLine, index: number) {
  const productId = `gid://shopify/Product/${index}`;
  const variantId = `gid://shopify/ProductVariant/${index}`;
  const metafields: AppMetafieldEntry[] = [];
  const add = (type: string, id: string, key: string, value: string | null) => {
    if (value !== null) metafields.push({ target: { type, id }, metafield: { namespace: "custom", key, value } });
  };
  add("product", productId, "species", line.species === null ? null : SPECIES_GIDS[line.species]);
  add("product", productId, "kcal_per_kg", line.kcalPerKg);
  add("variant", variantId, "bag_grams", line.bagGrams);
  return { line: { productId, variantId }, metafields };
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
