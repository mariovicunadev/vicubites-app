import { describe, expect, it } from "vitest";
import { DiscountClass, type CartInput } from "../generated/api";
import {
  REFILL_REWARD_MESSAGE,
  cartLinesDiscountsGenerateRun,
} from "./cart_lines_discounts_generate_run";

type Line = CartInput["cart"]["lines"][number];

const TODAY = "2026-11-07";

const product = (id: string, productType: string, sellingPlanId: string | null = null): Line => ({
  id,
  sellingPlanAllocation: sellingPlanId ? { sellingPlan: { id: sellingPlanId } } : null,
  merchandise: { __typename: "ProductVariant", product: { productType } },
});

const dryFood = (id: string) => product(id, "Dry Dog Food");
const wetFood = (id: string) => product(id, "Wet Dog Food");
const treat = (id: string) => product(id, "Dog Treats");
const dryFoodSubscription = (id: string) => product(id, "Dry Dog Food", "gid://shopify/SellingPlan/1");

const customItem = (id: string): Line => ({ id, sellingPlanAllocation: null, merchandise: { __typename: "CustomProduct" } });

/** A due-soon B2C cart with one dry food line; each test changes one thing. */
function cartInput({
  lines = [dryFood("gid://shopify/CartLine/1")],
  runOutOn = "2026-11-15" as string | null,
  guest = false,
  b2b = false,
  config = { percentage: 10, windowDays: 14 } as unknown,
  discountClasses = [DiscountClass.Product],
} = {}): CartInput {
  return {
    shop: { localTime: { date: TODAY } },
    cart: {
      buyerIdentity: {
        purchasingCompany: b2b ? { company: { id: "gid://shopify/Company/1" } } : null,
        customer: guest ? null : { refillRunOut: runOutOn === null ? null : { value: runOutOn } },
      },
      lines,
    },
    discount: {
      discountClasses,
      config: config === null ? null : { jsonValue: config },
    },
  };
}

describe("cartLinesDiscountsGenerateRun", () => {
  it("discounts every dry food line for a B2C customer whose refill is due", () => {
    const result = cartLinesDiscountsGenerateRun(
      cartInput({
        lines: [
          dryFood("gid://shopify/CartLine/1"),
          treat("gid://shopify/CartLine/2"),
          product("gid://shopify/CartLine/3", "Dry Cat Food"),
          wetFood("gid://shopify/CartLine/4"),
          dryFoodSubscription("gid://shopify/CartLine/5"),
        ],
      }),
    );

    expect(result).toEqual({
      operations: [
        {
          productDiscountsAdd: {
            candidates: [
              {
                message: REFILL_REWARD_MESSAGE,
                targets: [
                  { cartLine: { id: "gid://shopify/CartLine/1" } },
                  { cartLine: { id: "gid://shopify/CartLine/3" } },
                ],
                value: { percentage: { value: "10" } },
              },
            ],
            selectionStrategy: "FIRST",
          },
        },
      ],
    });
  });

  it("still rewards a reorder placed a few days after the run-out date", () => {
    const result = cartLinesDiscountsGenerateRun(cartInput({ runOutOn: "2026-11-01" }));
    expect(result.operations).toHaveLength(1);
  });

  it.each([
    ["a run-out date outside the window", cartInput({ runOutOn: "2026-12-01" })],
    ["no forecast for the customer", cartInput({ runOutOn: null })],
    ["a guest checkout", cartInput({ guest: true })],
    ["a B2B buyer", cartInput({ b2b: true })],
    ["dry food on a subscription only", cartInput({ lines: [dryFoodSubscription("gid://shopify/CartLine/1")] })],
    ["wet food and treats only", cartInput({ lines: [wetFood("gid://shopify/CartLine/1"), treat("gid://shopify/CartLine/2")] })],
    ["no dry food in the cart", cartInput({ lines: [treat("gid://shopify/CartLine/1"), customItem("gid://shopify/CartLine/2")] })],
    ["an empty cart", cartInput({ lines: [] })],
    ["no configuration", cartInput({ config: null })],
    ["an invalid configuration", cartInput({ config: { percentage: 80, windowDays: 14 } })],
    ["a discount without the product class", cartInput({ discountClasses: [DiscountClass.Order] })],
  ])("returns no operations for %s", (_label, input) => {
    expect(cartLinesDiscountsGenerateRun(input)).toEqual({ operations: [] });
  });
});
