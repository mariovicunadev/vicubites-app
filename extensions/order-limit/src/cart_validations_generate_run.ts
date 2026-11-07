import type {
  CartValidationsGenerateRunInput,
  CartValidationsGenerateRunResult,
} from "../generated/api";
import { orderLimitMessage, parseOrderLimitConfig, variantsOverLimit } from "./order-limit";

const NO_ERRORS: CartValidationsGenerateRunResult = { operations: [] };

/**
 * Blocks a B2C cart that holds more than `maxPerVariant` units of one
 * variant. B2B carts follow the native quantity rules of their catalog.
 *
 * Errors target the whole cart (`$.cart`) and name the product, so they
 * show in the cart (Storefront API) and at the top of checkout.
 */
export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const config = parseOrderLimitConfig(input.validation.config?.jsonValue);
  if (!config) return NO_ERRORS;

  if (input.cart.buyerIdentity?.purchasingCompany) return NO_ERRORS;

  const overLimit = variantsOverLimit(input.cart.lines, config.maxPerVariant);
  if (overLimit.length === 0) return NO_ERRORS;

  return {
    operations: [
      {
        validationAdd: {
          errors: overLimit.map((variant) => ({
            message: orderLimitMessage(config.maxPerVariant, variant.productTitle),
            target: "$.cart",
          })),
        },
      },
    ],
  };
}
