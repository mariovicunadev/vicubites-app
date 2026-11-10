/**
 * Pure helpers for the Refill Radar checkout block. They mirror the app's
 * dry food rule (`app/lib/refill/orders.ts`): a bag weight
 * (`custom.bag_grams`, set only on dry food bags), a species and calories per
 * kilo. Every value is language-independent: option names and text metafields
 * reach checkout translated, so the block never reads them. A contract test
 * in the app keeps the two in sync.
 */

/** Cart and customer metafield the block reads and writes; copied to the order. */
export const REMINDERS_KEY = "refill_reminders";

export interface CheckoutLine {
  productId: string;
  variantId: string;
}

/** The shape of `shopify.appMetafields` entries the block reads. */
export interface AppMetafieldEntry {
  target: { type: string; id: string };
  metafield: { namespace: string; key: string; value: string | number | boolean };
}

/**
 * Compares resource IDs whether they come as GIDs or bare numbers: cart lines
 * give `gid://shopify/Product/123`, while `appMetafields` targets give `123`
 * (API 2026-10, although the reference documents a GID).
 */
export function sameResource(a: string, b: string): boolean {
  const tail = (id: string) => id.slice(id.lastIndexOf("/") + 1);
  return tail(a) === tail(b);
}

function customValue(
  metafields: readonly AppMetafieldEntry[],
  type: "product" | "variant",
  id: string,
  key: string,
): string | null {
  const entry = metafields.find(
    ({ target, metafield }) =>
      target.type === type &&
      sameResource(target.id, id) &&
      metafield.namespace === "custom" &&
      metafield.key === key,
  );
  return entry ? String(entry.metafield.value) : null;
}

/** A `custom.bag_grams` value: positive integer grams. */
export function bagGramsFrom(value: string | null): number | null {
  const grams = Number(value);
  return value !== null && value !== "" && Number.isInteger(grams) && grams > 0 ? grams : null;
}

/**
 * `appMetafields` gives a metaobject reference as its GID, not its handle. The
 * species definition only accepts species entries (dog or cat), so a set
 * reference is enough.
 */
export function isMetaobjectReference(value: string | null): boolean {
  return value?.startsWith("gid://shopify/Metaobject/") ?? false;
}

/** A line Refill Radar forecasts from: a dry food bag with a species and calories. */
export function isDryFoodLine(line: CheckoutLine, metafields: readonly AppMetafieldEntry[]): boolean {
  if (!bagGramsFrom(customValue(metafields, "variant", line.variantId, "bag_grams"))) return false;
  if (!isMetaobjectReference(customValue(metafields, "product", line.productId, "species"))) return false;
  const kcalPerKg = Number(customValue(metafields, "product", line.productId, "kcal_per_kg"));
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
