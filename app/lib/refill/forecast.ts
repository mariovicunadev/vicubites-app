export type Species = "dog" | "cat";

/** How the days of food were worked out. */
export type ForecastBasis = "estimate" | "cadence";

/**
 * Reference energy per day for an average adult pet. They stand in for a pet
 * profile on a customer's first order; the result is an estimate for a
 * reminder, not feeding advice.
 */
export const REFERENCE_DAILY_KCAL: Record<Species, number> = { dog: 900, cat: 250 };

/** A forecast within this many days, or already past, counts as due soon. */
export const DUE_SOON_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Dry food bought for one species in one order. */
export interface Purchase {
  orderId: string;
  /** ISO 8601 timestamp of when the order was processed. */
  processedAt: string;
  species: Species;
  kcal: number;
  /** The main dry food variant bought for this species, if it still existed. */
  variantId: string | null;
}

export interface Forecast {
  species: Species;
  basis: ForecastBasis;
  /** Whole days the last purchase is expected to last. */
  daysOfFood: number;
  /** `YYYY-MM-DD` of the last purchase. */
  lastOrderOn: string;
  /** `YYYY-MM-DD` the food is expected to run out. */
  runOutOn: string;
}

/** Reads a bag size option value ("7 kg", "1.5 kg", "500 g") as grams. */
export function bagGrams(optionValue: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(kg|g)\s*$/i.exec(optionValue);
  if (!match) return null;
  const amount = Number(match[1]);
  return match[2].toLowerCase() === "kg" ? Math.round(amount * 1000) : amount;
}

/** Reads the `custom.species` metafield ("Dog", "Cat"). */
export function speciesFrom(value: string | null | undefined): Species | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "dog" || normalized === "cat" ? normalized : null;
}

/** Calories in `quantity` bags of `grams` each. */
export function bagKcal(grams: number, kcalPerKg: number, quantity: number): number {
  return (grams / 1000) * kcalPerKg * quantity;
}

export function toDay(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Forecasts one species from a customer's purchases of it. Purchases on the
 * same day count as one. With two or more purchase days, the median interval
 * between them wins over the estimate from calories.
 */
export function forecastSpecies(purchases: Purchase[]): Forecast | null {
  if (purchases.length === 0) return null;
  const { species } = purchases[0];

  const kcalByDay = new Map<string, number>();
  for (const purchase of purchases) {
    const day = toDay(purchase.processedAt);
    kcalByDay.set(day, (kcalByDay.get(day) ?? 0) + purchase.kcal);
  }
  const days = [...kcalByDay.keys()].sort();
  const lastOrderOn = days[days.length - 1];

  let basis: ForecastBasis;
  let daysOfFood: number;
  if (days.length >= 2) {
    const intervals = days.slice(1).map((day, index) => daysBetween(days[index], day));
    basis = "cadence";
    daysOfFood = Math.round(median(intervals));
  } else {
    basis = "estimate";
    daysOfFood = Math.round((kcalByDay.get(lastOrderOn) ?? 0) / REFERENCE_DAILY_KCAL[species]);
  }

  return { species, basis, daysOfFood, lastOrderOn, runOutOn: addDays(lastOrderOn, daysOfFood) };
}

/** One forecast per species the customer buys dry food for, earliest first. */
export function forecastCustomer(purchases: Purchase[]): Forecast[] {
  const bySpecies = new Map<Species, Purchase[]>();
  for (const purchase of purchases) {
    bySpecies.set(purchase.species, [...(bySpecies.get(purchase.species) ?? []), purchase]);
  }
  return [...bySpecies.values()]
    .map(forecastSpecies)
    .filter((forecast): forecast is Forecast => forecast !== null)
    .sort((a, b) => a.runOutOn.localeCompare(b.runOutOn));
}

/**
 * The variant of each species' latest purchase that has one, for the
 * storefront's reorder button. One ID per species, in no particular order.
 */
export function lastVariants(purchases: Purchase[]): string[] {
  const latest = new Map<Species, Purchase>();
  for (const purchase of purchases) {
    if (!purchase.variantId) continue;
    const current = latest.get(purchase.species);
    if (!current || purchase.processedAt > current.processedAt) latest.set(purchase.species, purchase);
  }
  return [...latest.values()].map((purchase) => purchase.variantId as string);
}

export function daysLeft(forecast: Pick<Forecast, "runOutOn">, today: string): number {
  return daysBetween(today, forecast.runOutOn);
}

export function isDueSoon(forecast: Pick<Forecast, "runOutOn">, today: string): boolean {
  return daysLeft(forecast, today) <= DUE_SOON_DAYS;
}
