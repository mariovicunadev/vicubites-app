import type {
  CartTransformRunInput,
  CartTransformRunResult,
  Operation,
} from "../generated/api";
import { parseStarterKitConfig, resolveOption, splitPrice } from "./starter-kit";

const NO_CHANGES: CartTransformRunResult = { operations: [] };

/**
 * Expands each Cat Starter Kit line into the recipe and treat the buyer
 * chose on the product page (line item properties `_kit_recipe` and
 * `_kit_treat`), one of each per kit.
 *
 * The kit's price is split across the two components in proportion to their
 * list prices, so the cart total doesn't change and each component carries
 * its own share for reporting.
 *
 * Returns no operations when the configuration is missing or invalid. Lines
 * that aren't the kit are never touched.
 */
export function cartTransformRun(input: CartTransformRunInput): CartTransformRunResult {
  const config = parseStarterKitConfig(input.cartTransform.config?.jsonValue);
  if (!config) return NO_CHANGES;

  const operations: Operation[] = [];
  for (const line of input.cart.lines) {
    const merchandise = line.merchandise;
    if (merchandise.__typename !== "ProductVariant" || merchandise.id !== config.kitVariantId) {
      continue;
    }

    const recipe = resolveOption(config.recipes, line.recipe?.value, config.defaultRecipe);
    const treat = resolveOption(config.treats, line.treat?.value, config.defaultTreat);
    const prices = splitPrice(line.cost.amountPerQuantity.amount, [recipe.weight, treat.weight]);
    if (!prices) continue;

    operations.push({
      lineExpand: {
        cartLineId: line.id,
        // Quantities are per kit: the line's own quantity multiplies them.
        expandedCartItems: [
          {
            merchandiseId: recipe.variantId,
            quantity: 1,
            price: { adjustment: { fixedPricePerUnit: { amount: prices[0] } } },
          },
          {
            merchandiseId: treat.variantId,
            quantity: 1,
            price: { adjustment: { fixedPricePerUnit: { amount: prices[1] } } },
          },
        ],
      },
    });
  }

  return operations.length === 0 ? NO_CHANGES : { operations };
}
