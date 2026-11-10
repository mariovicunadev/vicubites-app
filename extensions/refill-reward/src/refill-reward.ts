/** Settings stored in the discount's `$app.refill-reward-config` metafield. */
export interface RefillRewardConfig {
  /** Percentage off each dry food line, 1–50. */
  percentage: number;
  /** Days before or after the run-out date in which the reward applies, 1–60. */
  windowDays: number;
}

export const PERCENTAGE_RANGE = { min: 1, max: 50 } as const;
export const WINDOW_DAYS_RANGE = { min: 1, max: 60 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isIntInRange(value: unknown, range: { min: number; max: number }): value is number {
  return Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max;
}

/**
 * Reads the metafield's JSON value. Anything unexpected returns `null`, so
 * a broken configuration turns the discount off instead of guessing.
 */
export function parseRefillRewardConfig(value: unknown): RefillRewardConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const { percentage, windowDays } = value as Record<string, unknown>;
  if (!isIntInRange(percentage, PERCENTAGE_RANGE) || !isIntInRange(windowDays, WINDOW_DAYS_RANGE)) {
    return null;
  }
  return { percentage, windowDays };
}

/** Days from `from` to `to` for `YYYY-MM-DD` dates, or `null` if either is malformed. */
export function daysBetween(from: string, to: string): number | null {
  const start = toUtcDay(from);
  const end = toUtcDay(to);
  if (start === null || end === null) return null;
  return Math.round((end - start) / DAY_MS);
}

function toUtcDay(date: string): number | null {
  const match = ISO_DATE.exec(date);
  if (!match) return null;
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

/**
 * True when the run-out date is at most `windowDays` away from today, in
 * either direction: a customer reordering a little late still qualifies.
 */
export function isRefillDue(runOutOn: string, today: string, windowDays: number): boolean {
  const days = daysBetween(today, runOutOn);
  return days !== null && Math.abs(days) <= windowDays;
}

/**
 * Dry food is a variant with a bag weight (`custom.bag_grams`, set only on
 * dry food bags). Product type, titles and option names reach Functions in the
 * buyer's language, so the rule never reads them.
 */
export function isDryFood(bagGrams: string | null | undefined): boolean {
  const grams = Number(bagGrams);
  return bagGrams != null && bagGrams !== "" && Number.isInteger(grams) && grams > 0;
}
