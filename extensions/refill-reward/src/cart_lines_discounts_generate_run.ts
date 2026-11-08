import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  type CartInput,
  type CartLinesDiscountsGenerateRunResult,
} from "../generated/api";
import { isDryFood, isRefillDue, parseRefillRewardConfig } from "./refill-reward";

export const REFILL_REWARD_MESSAGE = "Refill reward";

const NO_DISCOUNT: CartLinesDiscountsGenerateRunResult = { operations: [] };

/**
 * Discounts the dry food in a B2C cart when the customer's food is due to
 * run out within the configured window (before or after the run-out date).
 *
 * Lines on a subscription (selling plan) are left out: they already get the
 * plan's own discount and arrive without a reorder.
 *
 * Returns no operations whenever something is missing: no product class,
 * invalid configuration, a guest or B2B buyer, no forecast, or no dry food
 * bought outside a subscription.
 */
export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return NO_DISCOUNT;
  }

  const config = parseRefillRewardConfig(input.discount.config?.jsonValue);
  if (!config) return NO_DISCOUNT;

  const buyer = input.cart.buyerIdentity;
  // B2B buyers have their own catalog pricing; guests have no forecast.
  if (!buyer?.customer || buyer.purchasingCompany) return NO_DISCOUNT;

  const runOutOn = buyer.customer.refillRunOut?.value;
  if (!runOutOn || !isRefillDue(runOutOn, input.shop.localTime.date, config.windowDays)) {
    return NO_DISCOUNT;
  }

  // One plain loop, no intermediate arrays: per-line cost dominates the
  // instruction budget in large carts.
  const targets: { cartLine: { id: string } }[] = [];
  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (
      !line.sellingPlanAllocation &&
      merchandise.__typename === "ProductVariant" &&
      isDryFood(merchandise.product.productType)
    ) {
      targets.push({ cartLine: { id: line.id } });
    }
  }

  if (targets.length === 0) return NO_DISCOUNT;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [
            {
              message: REFILL_REWARD_MESSAGE,
              targets,
              // `Decimal` is serialized as a string.
              value: { percentage: { value: String(config.percentage) } },
            },
          ],
          selectionStrategy: ProductDiscountSelectionStrategy.First,
        },
      },
    ],
  };
}
