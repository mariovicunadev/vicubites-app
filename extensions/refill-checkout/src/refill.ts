/**
 * Pure helpers for the Refill Radar checkout block. They mirror the app's
 * dry food rule (`app/lib/refill/orders.ts`): a bag size in grams or kilos,
 * a dog or cat species and calories per kilo. A contract test in the app
 * keeps the two in sync.
 */

/** Cart and customer metafield the block reads and writes; copied to the order. */
export const REMINDERS_KEY = "refill_reminders";

/** The bag size option of dry food products. */
export const SIZE_OPTION = "Size";

export interface CheckoutLine {
  productId: string;
  options: readonly { name: string; value: string }[];
}

/** The shape of `shopify.appMetafields` entries the block reads. */
export interface AppMetafieldEntry {
  target: { type: string; id: string };
  metafield: { namespace: string; key: string; value: string | number | boolean };
}

/** Reads a bag size option value ("7 kg", "1.5 kg", "500 g") as grams. */
export function bagGrams(optionValue: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(kg|g)\s*$/i.exec(optionValue);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2].toLowerCase() === "kg" ? Math.round(amount * 1000) : amount;
}

function productValue(metafields: readonly AppMetafieldEntry[], productId: string, key: string): string | null {
  const entry = metafields.find(
    ({ target, metafield }) =>
      target.type === "product" && target.id === productId && metafield.namespace === "custom" && metafield.key === key,
  );
  return entry ? String(entry.metafield.value) : null;
}

/** A line Refill Radar forecasts from: a dog or cat dry food bag with calories. */
export function isDryFoodLine(line: CheckoutLine, metafields: readonly AppMetafieldEntry[]): boolean {
  const size = line.options.find((option) => option.name === SIZE_OPTION)?.value;
  if (!size || !bagGrams(size)) return false;
  const species = productValue(metafields, line.productId, "species")?.trim().toLowerCase();
  if (species !== "dog" && species !== "cat") return false;
  const kcalPerKg = Number(productValue(metafields, line.productId, "kcal_per_kg"));
  return Number.isFinite(kcalPerKg) && kcalPerKg > 0;
}

export function hasDryFood(lines: readonly CheckoutLine[], metafields: readonly AppMetafieldEntry[]): boolean {
  return lines.some((line) => isDryFoodLine(line, metafields));
}

function reminderValue(metafields: readonly AppMetafieldEntry[], targetType: string): boolean | null {
  const entry = metafields.find(
    ({ target, metafield }) =>
      target.type === targetType && metafield.namespace === "$app" && metafield.key === REMINDERS_KEY,
  );
  if (!entry) return null;
  const value = String(entry.metafield.value);
  return value === "true" ? true : value === "false" ? false : null;
}

/**
 * Whether the checkbox shows as checked: the choice made in this checkout,
 * else the signed-in customer's saved choice, else on (reminders are on
 * unless a customer turns them off).
 */
export function remindersChecked(metafields: readonly AppMetafieldEntry[]): boolean {
  return reminderValue(metafields, "cart") ?? reminderValue(metafields, "customer") ?? true;
}
