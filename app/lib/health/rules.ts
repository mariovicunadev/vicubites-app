import { hasMetafield, type ProductData } from "./product";

export interface HealthRule {
  id: string;
  label: string;
  /** Why the data matters, shown to merchants. */
  reason: string;
  /** Share of the 100-point score. */
  weight: number;
  /** Returns what's missing; an empty list means the rule passes. */
  check(product: ProductData): string[];
}

function missingMetafields(product: ProductData, fields: Record<string, string>): string[] {
  return Object.entries(fields)
    .filter(([key]) => !hasMetafield(product, key))
    .map(([, label]) => label);
}

/**
 * Nutrition Data Health rules. Weights add up to 100. Metafield keys are the
 * ones the storefront uses (guaranteed analysis panel, portion calculator,
 * Search & Discovery filters).
 */
export const RULES = [
  {
    id: "guaranteed-analysis",
    label: "Guaranteed analysis",
    reason: "Pet food labels state minimum protein and fat and maximum fiber and moisture.",
    weight: 20,
    check: (product) =>
      missingMetafields(product, {
        "custom.protein_min": "Crude protein (min)",
        "custom.fat_min": "Crude fat (min)",
        "custom.fiber_max": "Crude fiber (max)",
        "custom.moisture_max": "Moisture (max)",
      }),
  },
  {
    id: "ingredients",
    label: "Ingredients",
    reason: "Shoppers filter and compare recipes by their ingredients.",
    weight: 20,
    check: (product) => missingMetafields(product, { "custom.ingredients": "Ingredient list" }),
  },
  {
    id: "calories",
    label: "Calorie content",
    reason: "The portion calculator needs kcal per kg to suggest daily amounts.",
    weight: 15,
    check: (product) => missingMetafields(product, { "custom.kcal_per_kg": "kcal per kg" }),
  },
  {
    id: "classification",
    label: "Classification",
    reason: "Collection filters use species, life stage, food type and main protein.",
    weight: 15,
    check: (product) =>
      missingMetafields(product, {
        "custom.species": "Species",
        "custom.life_stage": "Life stage",
        "custom.food_type": "Food type",
        "custom.main_protein": "Main protein",
      }),
  },
  {
    id: "images",
    label: "Images",
    reason: "Products without images convert poorly and can't be featured.",
    weight: 10,
    check: (product) => (product.media.length > 0 ? [] : ["At least one image"]),
  },
  {
    id: "image-alt",
    label: "Image alt text",
    reason: "Alt text makes product images accessible and indexable.",
    weight: 10,
    check: (product) => {
      const missing = product.media.filter((media) => !media.alt?.trim()).length;
      return missing > 0 ? [`Alt text on ${missing} of ${product.media.length} images`] : [];
    },
  },
  {
    id: "seo",
    label: "Search listing",
    reason: "A specific title and description improve how the product shows in search results.",
    weight: 5,
    check: (product) =>
      missingMetafields(product, {
        "global.title_tag": "SEO title",
        "global.description_tag": "SEO description",
      }),
  },
  {
    id: "sku",
    label: "SKUs",
    reason: "Wholesale orders and inventory sync identify each bag size by SKU.",
    weight: 5,
    check: (product) =>
      product.variants
        .filter((variant) => !variant.sku?.trim())
        .map((variant) => `SKU for ${variant.title || "variant"}`),
  },
] as const satisfies readonly HealthRule[];

export type RuleId = (typeof RULES)[number]["id"];

export const RULES_BY_ID: ReadonlyMap<string, HealthRule> = new Map(
  RULES.map((rule) => [rule.id, rule]),
);
