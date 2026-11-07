import { describe, expect, it } from "vitest";
import type { CartValidationsGenerateRunInput } from "../generated/api";
import { cartValidationsGenerateRun } from "./cart_validations_generate_run";

type Line = CartValidationsGenerateRunInput["cart"]["lines"][number];

const variant = (id: string, quantity: number, title = "Adult Chicken Recipe"): Line => ({
  quantity,
  merchandise: { __typename: "ProductVariant", id, product: { title } },
});

const customItem = (quantity: number): Line => ({ quantity, merchandise: { __typename: "CustomProduct" } });

/** A B2C cart with a limit of 6; each test changes one thing. */
function cartInput({
  lines = [variant("gid://shopify/ProductVariant/1", 7)],
  b2b = false,
  config = { maxPerVariant: 6 } as unknown,
} = {}): CartValidationsGenerateRunInput {
  return {
    cart: {
      buyerIdentity: {
        purchasingCompany: b2b ? { company: { id: "gid://shopify/Company/1" } } : null,
      },
      lines,
    },
    validation: { config: config === null ? null : { jsonValue: config } },
  };
}

describe("cartValidationsGenerateRun", () => {
  it("returns one cart-level error per variant over the limit", () => {
    const result = cartValidationsGenerateRun(
      cartInput({
        lines: [
          variant("gid://shopify/ProductVariant/1", 7, "Puppy Salmon"),
          variant("gid://shopify/ProductVariant/2", 2),
          variant("gid://shopify/ProductVariant/3", 4, "Senior Lamb"),
          variant("gid://shopify/ProductVariant/3", 3, "Senior Lamb"),
        ],
      }),
    );

    expect(result).toEqual({
      operations: [
        {
          validationAdd: {
            errors: [
              {
                message: "Limit of 6 per order for Puppy Salmon. For wholesale, contact us about a business account.",
                target: "$.cart",
              },
              {
                message: "Limit of 6 per order for Senior Lamb. For wholesale, contact us about a business account.",
                target: "$.cart",
              },
            ],
          },
        },
      ],
    });
  });

  it.each([
    ["a cart within the limit", cartInput({ lines: [variant("gid://shopify/ProductVariant/1", 6)] })],
    ["a B2B buyer", cartInput({ b2b: true })],
    ["custom items only", cartInput({ lines: [customItem(20)] })],
    ["an empty cart", cartInput({ lines: [] })],
    ["no configuration", cartInput({ config: null })],
    ["an invalid configuration", cartInput({ config: { maxPerVariant: 0 } })],
  ])("returns no operations for %s", (_label, input) => {
    expect(cartValidationsGenerateRun(input)).toEqual({ operations: [] });
  });
});
