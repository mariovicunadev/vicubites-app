/** One choice the buyer can make in the kit (a recipe or a treat flavor). */
export interface KitOption {
  /** Value sent as the line item property (for example `chicken-rice`). */
  value: string;
  /** Label shown in the product page picker. */
  label: string;
  /** Component variant the kit expands into. */
  variantId: string;
  /** List price of the component, used only as its share of the kit price. */
  weight: number;
}

/** Settings stored in the Cart Transform's `$app.starter-kit-config` metafield. */
export interface StarterKitConfig {
  /** The kit's own variant: only lines with this variant are expanded. */
  kitVariantId: string;
  recipes: KitOption[];
  treats: KitOption[];
  /** Used when the line has no recipe or an unknown one. Must be one of `recipes`. */
  defaultRecipe: string;
  /** Used when the line has no treat or an unknown one. Must be one of `treats`. */
  defaultTreat: string;
}

/** Line item property keys written by the product page picker. */
export const RECIPE_KEY = "_kit_recipe";
export const TREAT_KEY = "_kit_treat";

// A prefix check instead of a regular expression: regex matching is
// expensive in the Function's WebAssembly runtime.
const VARIANT_GID_PREFIX = "gid://shopify/ProductVariant/";

function isVariantId(value: unknown): value is string {
  return typeof value === "string" && value.length > VARIANT_GID_PREFIX.length && value.startsWith(VARIANT_GID_PREFIX);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function parseOption(value: unknown): KitOption | null {
  if (typeof value !== "object" || value === null) return null;
  const { value: key, label, variantId, weight } = value as Record<string, unknown>;
  if (!isNonEmptyString(key) || !isNonEmptyString(label)) return null;
  if (!isVariantId(variantId)) return null;
  if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) return null;
  return { value: key, label, variantId, weight };
}

function parseOptions(value: unknown): KitOption[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const options: KitOption[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const option = parseOption(item);
    if (!option || seen.has(option.value)) return null;
    seen.add(option.value);
    options.push(option);
  }
  return options;
}

/**
 * Reads the metafield's JSON value. Anything unexpected returns `null`, so a
 * broken configuration turns the expansion off instead of guessing.
 */
export function parseStarterKitConfig(value: unknown): StarterKitConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { kitVariantId, defaultRecipe, defaultTreat } = raw;
  if (!isVariantId(kitVariantId)) return null;

  const recipes = parseOptions(raw.recipes);
  const treats = parseOptions(raw.treats);
  if (!recipes || !treats) return null;
  if (!recipes.some((option) => option.value === defaultRecipe)) return null;
  if (!treats.some((option) => option.value === defaultTreat)) return null;

  return {
    kitVariantId,
    recipes,
    treats,
    defaultRecipe: defaultRecipe as string,
    defaultTreat: defaultTreat as string,
  };
}

/**
 * Picks the option the buyer chose, or the default when the value is
 * missing or unknown (an old picker, a hand-built Ajax request). The cart
 * must never break because of a bad property.
 */
export function resolveOption(
  options: readonly KitOption[],
  chosen: string | null | undefined,
  fallback: string,
): KitOption {
  let fallbackOption = options[0];
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (chosen && option.value === chosen) return option;
    if (option.value === fallback) fallbackOption = option;
  }
  // The parser guarantees the fallback is one of the options.
  return fallbackOption;
}

/**
 * Splits one unit of the kit price across its components in proportion to
 * their weights. Works in cents so the parts always add up to the kit price
 * exactly: each part is rounded down and the remainder goes to the last one.
 *
 * Returns decimal strings with two places (the Function API `Decimal` type),
 * or `null` if the price can't be read.
 */
export function splitPrice(unitPrice: string, weights: readonly number[]): string[] | null {
  const total = Number(unitPrice);
  if (!Number.isFinite(total) || total < 0 || weights.length === 0) return null;

  const totalCents = Math.round(total * 100);
  // Plain loops, no callbacks: per-line work is what grows with the cart.
  let weightSum = 0;
  for (let i = 0; i < weights.length; i++) weightSum += weights[i];
  if (!(weightSum > 0)) return null;

  const parts: string[] = [];
  let assigned = 0;
  for (let i = 0; i < weights.length - 1; i++) {
    const part = Math.floor((totalCents * weights[i]) / weightSum);
    parts.push(formatCents(part));
    assigned += part;
  }
  parts.push(formatCents(totalCents - assigned));
  return parts;
}

function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const rest = cents % 100;
  return `${whole}.${rest < 10 ? "0" : ""}${rest}`;
}
