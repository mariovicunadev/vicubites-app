import type { StarterKitConfig } from "./starter-kit";

/** A two-recipe, two-treat configuration shared by the tests. */
export const VALID_CONFIG: StarterKitConfig = {
  kitVariantId: "gid://shopify/ProductVariant/100",
  recipes: [
    { value: "chicken-rice", label: "Chicken & Rice", variantId: "gid://shopify/ProductVariant/201", weight: 24.99 },
    { value: "salmon", label: "Salmon", variantId: "gid://shopify/ProductVariant/202", weight: 27.99 },
  ],
  treats: [
    { value: "chicken", label: "Chicken", variantId: "gid://shopify/ProductVariant/301", weight: 6.99 },
    { value: "tuna", label: "Tuna", variantId: "gid://shopify/ProductVariant/302", weight: 7.49 },
  ],
  defaultRecipe: "chicken-rice",
  defaultTreat: "chicken",
};
