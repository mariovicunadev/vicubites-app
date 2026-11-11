import { LanguageCode, type CartValidationsGenerateRunInput } from "../generated/api";

/** Settings stored in the validation's `$app.order-limit-config` metafield. */
export interface OrderLimitConfig {
  /** Most units of one variant a B2C order can hold, 1–99. */
  maxPerVariant: number;
}

export const MAX_PER_VARIANT_RANGE = { min: 1, max: 99 } as const;

export type CartLine = CartValidationsGenerateRunInput["cart"]["lines"][number];

/** A variant whose total quantity in the cart is over the limit. */
export interface OverLimitVariant {
  variantId: string;
  productTitle: string;
  quantity: number;
}

/**
 * Reads the metafield's JSON value. Anything unexpected returns `null`, so
 * a broken configuration turns the rule off instead of blocking checkout.
 */
export function parseOrderLimitConfig(value: unknown): OrderLimitConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const { maxPerVariant } = value as Record<string, unknown>;
  if (
    !Number.isInteger(maxPerVariant) ||
    (maxPerVariant as number) < MAX_PER_VARIANT_RANGE.min ||
    (maxPerVariant as number) > MAX_PER_VARIANT_RANGE.max
  ) {
    return null;
  }
  return { maxPerVariant: maxPerVariant as number };
}

/**
 * Adds quantities up per variant (one variant can sit on several lines,
 * for example with different line properties) and returns the variants
 * over the limit, in cart order.
 *
 * Two plain loops over the input lines with no intermediate arrays: the
 * function runs on every cart change, and per-line cost dominates the
 * instruction budget in large carts.
 */
export function variantsOverLimit(lines: readonly CartLine[], maxPerVariant: number): OverLimitVariant[] {
  const totals: Record<string, number> = {};
  for (const line of lines) {
    const merchandise = line.merchandise;
    if (merchandise.__typename !== "ProductVariant") continue;
    totals[merchandise.id] = (totals[merchandise.id] ?? 0) + line.quantity;
  }

  const overLimit: OverLimitVariant[] = [];
  for (const line of lines) {
    const merchandise = line.merchandise;
    if (merchandise.__typename !== "ProductVariant") continue;
    const quantity = totals[merchandise.id];
    if (quantity > maxPerVariant) {
      overLimit.push({ variantId: merchandise.id, productTitle: merchandise.product.title, quantity });
      totals[merchandise.id] = 0; // report each variant once
    }
  }
  return overLimit;
}

/**
 * Checkout error in the buyer's language (English otherwise). `productTitle`
 * already arrives localized from the function input.
 */
export function orderLimitMessage(maxPerVariant: number, productTitle: string, language: LanguageCode): string {
  const messages: Partial<Record<LanguageCode, OrderLimitTemplate>> = ORDER_LIMIT_MESSAGES;
  return (messages[language] ?? ORDER_LIMIT_MESSAGES[LanguageCode.En])(maxPerVariant, productTitle);
}

type OrderLimitTemplate = (maxPerVariant: number, productTitle: string) => string;

/**
 * The checkout error by buyer language. A Function's locale files translate only its name and description,
 * so buyer-facing text lives here: add one entry per supported language.
 */
export const ORDER_LIMIT_MESSAGES = {
  [LanguageCode.En]: (maxPerVariant, productTitle) =>
    `Limit of ${maxPerVariant} per order for ${productTitle}. For wholesale, contact us about a business account.`,
  [LanguageCode.Es]: (maxPerVariant, productTitle) =>
    `Límite de ${maxPerVariant} por pedido para ${productTitle}. ` +
    "Para compras al por mayor, contáctanos para abrir una cuenta de empresa.",
} satisfies Partial<Record<LanguageCode, OrderLimitTemplate>>;
