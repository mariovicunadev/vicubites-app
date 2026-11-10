import {
  BuyerJourneyStep,
  type CartValidationsGenerateRunInput,
  type CartValidationsGenerateRunResult,
} from "../generated/api";
import { orderLimitMessage, parseOrderLimitConfig, variantsOverLimit } from "./order-limit";

const NO_ERRORS: CartValidationsGenerateRunResult = { operations: [] };

/**
 * Blocks a B2C cart that holds more than `maxPerVariant` units of one
 * variant. B2B carts follow the native quantity rules of their catalog.
 *
 * Runs only in checkout (interaction and completion). In the online store
 * cart, a returned error rejects every cart change, removals included, so a
 * cart that is already over the limit (for example, built while signed in
 * as B2B) could never be fixed. Errors target the whole cart (`$.cart`) and
 * name the product.
 */
export function cartValidationsGenerateRun(
  input: CartValidationsGenerateRunInput,
): CartValidationsGenerateRunResult {
  const step = input.buyerJourney.step;
  if (step !== BuyerJourneyStep.CheckoutInteraction && step !== BuyerJourneyStep.CheckoutCompletion) {
    return NO_ERRORS;
  }

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
            message: orderLimitMessage(
              config.maxPerVariant,
              variant.productTitle,
              input.localization.language.isoCode,
            ),
            target: "$.cart",
          })),
        },
      },
    ],
  };
}
