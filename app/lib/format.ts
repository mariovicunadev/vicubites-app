/** Mirrors the Admin API `CountPrecision` enum returned by `*Count` fields. */
export type CountPrecision = "EXACT" | "AT_LEAST";

/**
 * Formats an Admin API count. `AT_LEAST` means Shopify stopped counting at
 * the limit, so the number is shown as a lower bound ("10,000+").
 */
export function formatCount(
  count: number,
  precision: CountPrecision = "EXACT",
  locale = "en-US",
): string {
  const formatted = new Intl.NumberFormat(locale).format(count);
  return precision === "AT_LEAST" ? `${formatted}+` : formatted;
}
