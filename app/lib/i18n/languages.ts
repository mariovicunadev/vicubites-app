/**
 * Storefront languages the app's buyer-facing text supports (ISO codes, lowercase as in locale file names).
 * Adding a language: add it here, then the locale test lists every file and message still missing.
 */
export const SUPPORTED_LANGUAGES = ["en", "es"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Extensions whose text reaches buyers: they need a locale file for every supported language. */
export const BUYER_FACING_EXTENSIONS = ["refill-radar", "refill-checkout", "refill-account"] as const;

/** Flattens a locale JSON into dotted keys (`refill.month_names`), so files can be compared key by key. */
export function localeKeys(locale: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(locale).flatMap(([key, value]) =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? localeKeys(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/** Keys of the default (English) locale that another locale lacks. */
export function missingKeys(base: Record<string, unknown>, locale: Record<string, unknown>): string[] {
  const present = new Set(localeKeys(locale));
  return localeKeys(base).filter((key) => !present.has(key));
}
