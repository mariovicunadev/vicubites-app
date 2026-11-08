/**
 * Settings for the two checkout rules backed by the app's Functions.
 *
 * Each rule keeps its settings in an `$app` JSON metafield on its own
 * instance (the automatic discount or the validation). The Function reads
 * the metafield on every run, so a change here takes effect without a
 * redeploy. The ranges must match the ones each Function accepts: a
 * contract test checks that every value this form saves parses in the
 * Function too.
 */

export interface RefillRewardSettings {
  /** Percentage off dry food lines, 1–50. */
  percentage: number;
  /** Days before or after the run-out date in which the reward applies, 1–60. */
  windowDays: number;
}

export interface OrderLimitSettings {
  /** Most units of one variant a B2C order can hold, 1–99. */
  maxPerVariant: number;
}

interface Range {
  readonly min: number;
  readonly max: number;
}

export const RANGES = {
  percentage: { min: 1, max: 50 },
  windowDays: { min: 1, max: 60 },
  maxPerVariant: { min: 1, max: 99 },
} as const satisfies Record<string, Range>;

/** Used when an instance is created without settings from the form. */
export const DEFAULT_REFILL_REWARD: RefillRewardSettings = { percentage: 10, windowDays: 14 };
export const DEFAULT_ORDER_LIMIT: OrderLimitSettings = { maxPerVariant: 6 };

export const REFILL_REWARD_CONFIG_KEY = "refill-reward-config";
export const ORDER_LIMIT_CONFIG_KEY = "order-limit-config";

/** Either the parsed settings or one message per invalid field. */
export type FormResult<T> =
  | { ok: true; value: T }
  | { ok: false; fieldErrors: Partial<Record<keyof T & string, string>> };

function isIntInRange(value: unknown, range: Range): value is number {
  return Number.isInteger(value) && (value as number) >= range.min && (value as number) <= range.max;
}

/**
 * Reads one form field as a whole number in range. Returns the number, or
 * the message to show under the field.
 */
export function parseIntField(raw: FormDataEntryValue | null, range: Range, label: string): number | string {
  const text = typeof raw === "string" ? raw.trim() : "";
  const message = `${label} must be a whole number from ${range.min} to ${range.max}.`;
  if (!/^\d+$/.test(text)) return message;
  const value = Number(text);
  return isIntInRange(value, range) ? value : message;
}

export function validateRefillRewardForm(form: {
  get(name: string): FormDataEntryValue | null;
}): FormResult<RefillRewardSettings> {
  const percentage = parseIntField(form.get("percentage"), RANGES.percentage, "Discount");
  const windowDays = parseIntField(form.get("windowDays"), RANGES.windowDays, "Window");
  if (typeof percentage === "number" && typeof windowDays === "number") {
    return { ok: true, value: { percentage, windowDays } };
  }
  const fieldErrors: Partial<Record<keyof RefillRewardSettings, string>> = {};
  if (typeof percentage === "string") fieldErrors.percentage = percentage;
  if (typeof windowDays === "string") fieldErrors.windowDays = windowDays;
  return { ok: false, fieldErrors };
}

export function validateOrderLimitForm(form: {
  get(name: string): FormDataEntryValue | null;
}): FormResult<OrderLimitSettings> {
  const maxPerVariant = parseIntField(form.get("maxPerVariant"), RANGES.maxPerVariant, "Limit");
  return typeof maxPerVariant === "number"
    ? { ok: true, value: { maxPerVariant } }
    : { ok: false, fieldErrors: { maxPerVariant } };
}

/** Reads a stored metafield value for display; `null` if missing or invalid. */
export function readRefillRewardSettings(value: unknown): RefillRewardSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const { percentage, windowDays } = value as Record<string, unknown>;
  return isIntInRange(percentage, RANGES.percentage) && isIntInRange(windowDays, RANGES.windowDays)
    ? { percentage, windowDays }
    : null;
}

export function readOrderLimitSettings(value: unknown): OrderLimitSettings | null {
  if (typeof value !== "object" || value === null) return null;
  const { maxPerVariant } = value as Record<string, unknown>;
  return isIntInRange(maxPerVariant, RANGES.maxPerVariant) ? { maxPerVariant } : null;
}
