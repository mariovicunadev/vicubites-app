/**
 * Pure view model for the Refill Radar customer account page. The forecast
 * JSON is written by the app (`withVariants` in `app/lib/refill/forecast.ts`);
 * a contract test in the app keeps this parser and `DUE_SOON_DAYS` in sync.
 */

export type Species = "dog" | "cat";

/** A forecast within this many days, or already past, counts as due soon. */
export const DUE_SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface ForecastEntry {
  species: Species;
  daysOfFood: number;
  lastOrderOn: string;
  runOutOn: string;
  variantId: string | null;
}

export interface SpeciesCard extends ForecastEntry {
  /** Whole days until the food runs out; negative once past. */
  daysLeft: number;
  dueSoon: boolean;
  /** Storefront cart permalink for the last bag, or null if none is left. */
  reorderUrl: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Reads the `refill_forecast` metafield; drops anything malformed instead of failing the page. */
export function parseForecasts(value: string | null | undefined): ForecastEntry[] {
  if (!value) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): ForecastEntry[] => {
    if (!isRecord(item)) return [];
    const { species, daysOfFood, lastOrderOn, runOutOn, variantId } = item;
    if (species !== "dog" && species !== "cat") return [];
    if (typeof daysOfFood !== "number" || typeof lastOrderOn !== "string" || typeof runOutOn !== "string") return [];
    if (!DAY.test(lastOrderOn) || !DAY.test(runOutOn)) return [];
    return [{ species, daysOfFood, lastOrderOn, runOutOn, variantId: typeof variantId === "string" ? variantId : null }];
  });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** `https://shop.example/cart/123:1` for `gid://shopify/ProductVariant/123`. */
export function reorderUrl(shopUrl: string, variantId: string | null): string | null {
  const id = variantId?.match(/^gid:\/\/shopify\/ProductVariant\/(\d+)$/)?.[1];
  if (!id || !shopUrl) return null;
  return `${shopUrl.replace(/\/+$/, "")}/cart/${id}:1`;
}

/** One card per species, earliest run-out first. */
export function toCards(entries: ForecastEntry[], today: string, shopUrl: string): SpeciesCard[] {
  return [...entries]
    .sort((a, b) => a.runOutOn.localeCompare(b.runOutOn))
    .map((entry) => {
      const daysLeft = daysBetween(today, entry.runOutOn);
      return { ...entry, daysLeft, dueSoon: daysLeft <= DUE_SOON_DAYS, reorderUrl: reorderUrl(shopUrl, entry.variantId) };
    });
}

/** Reminders are on unless the customer turned them off in checkout. */
export function remindersOn(value: string | null | undefined): boolean {
  return value !== "false";
}
