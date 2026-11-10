/**
 * Language-independent product keys. Species, food type and main protein are
 * metaobject references (`custom.species`, `custom.food_type`,
 * `custom.main_protein`): logic compares the metaobject handle, which is never
 * translated; buyers see the entry's translatable `label`. Bag weight is the
 * variant metafield `custom.bag_grams`, never the translatable `Size` option.
 */

export const SPECIES = ["dog", "cat"] as const;
export const FOOD_TYPES = ["dry", "wet", "treats"] as const;
export const PROTEINS = ["chicken", "salmon", "lamb", "turkey", "beef"] as const;

export type SpeciesKey = (typeof SPECIES)[number];
export type FoodTypeKey = (typeof FOOD_TYPES)[number];

/** Metaobject types behind each product key metafield. */
export const KEY_METAOBJECT_TYPES = {
  species: "species",
  food_type: "food_type",
  main_protein: "protein",
} as const;

/** A metaobject reference metafield as the Admin API returns it with `reference { ... on Metaobject { handle } }`. */
export interface KeyReference {
  reference?: { handle?: string | null } | null;
}

/** The handle of a referenced metaobject, or null when the metafield is empty. */
export function keyHandle(field: KeyReference | null | undefined): string | null {
  return field?.reference?.handle ?? null;
}

/** Narrows a handle to a known key of the given list. */
export function knownKey<T extends string>(keys: readonly T[], handle: string | null | undefined): T | null {
  return handle != null && (keys as readonly string[]).includes(handle) ? (handle as T) : null;
}

/** Reads a `custom.bag_grams` value (positive integer grams). */
export function bagGramsFrom(value: string | number | null | undefined): number | null {
  const grams = Number(value);
  return value != null && value !== "" && Number.isInteger(grams) && grams > 0 ? grams : null;
}
