/**
 * Cat Starter Kit: builds the Cart Transform configuration and the product
 * page picker's options from the store's own products.
 *
 * Both come from one build, so the picker never offers a choice the function
 * can't expand. The list prices saved as weights are a snapshot: saving again
 * refreshes them.
 *
 * The configuration shape must match what `extensions/starter-kit-expand`
 * parses; a contract test checks that every configuration built here parses
 * in the function too.
 */

/** Where the kit and its components come from. */
export const STARTER_KIT = {
  kitHandle: "cat-starter-kit",
  /** Every active dry cat food; the kit takes its smallest bag. */
  recipeQuery: "product_type:'Dry Cat Food' AND status:active",
  recipeVariantTitle: "1.5 kg",
  treatsHandle: "crunchy-treats-for-cats",
  defaultRecipe: "adult-chicken-and-turkey-recipe-dry-cat-food",
  defaultTreat: "chicken",
} as const;

export const STARTER_KIT_FUNCTION_HANDLE = "starter-kit-expand";
/** Metafield on the cart transform, read by the function. */
export const STARTER_KIT_CONFIG_KEY = "starter-kit-config";
/** App-owned shop metafield, read by the `starter-kit-picker` theme block. */
export const STARTER_KIT_PICKER_KEY = "starter_kit_picker";

interface VariantData {
  id: string;
  title: string;
  price: string;
}

/** The store data the build needs, as the Admin API returns it. */
export interface StarterKitSource {
  kit: {
    /** Numeric product ID, as Liquid's `product.id` sees it. */
    legacyResourceId: string;
    status: string;
    variants: { id: string; requiresComponents: boolean }[];
  } | null;
  recipes: { handle: string; title: string; variants: VariantData[] }[];
  treats: { status: string; variants: VariantData[] } | null;
}

export interface FunctionOption {
  value: string;
  label: string;
  variantId: string;
  weight: number;
}

export interface StarterKitFunctionConfig {
  kitVariantId: string;
  recipes: FunctionOption[];
  treats: FunctionOption[];
  defaultRecipe: string;
  defaultTreat: string;
}

export interface StarterKitPickerConfig {
  productId: number;
  recipes: { value: string; label: string }[];
  treats: { value: string; label: string }[];
  defaultRecipe: string;
  defaultTreat: string;
}

export type StarterKitBuild =
  | { ok: true; functionConfig: StarterKitFunctionConfig; picker: StarterKitPickerConfig }
  | { ok: false; problems: string[] };

/** `Salmon` → `salmon`; `Ocean Fish` → `ocean-fish`. */
export function toOptionValue(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function toOption(value: string, label: string, variant: VariantData): FunctionOption | null {
  const weight = Number(variant.price);
  // A free component would get no share of the kit price: leave it out.
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return { value, label, variantId: variant.id, weight };
}

function pickDefault(options: FunctionOption[], preferred: string): string {
  return options.some((option) => option.value === preferred) ? preferred : options[0].value;
}

/**
 * Checks the store data and builds both configurations, or lists every
 * problem the merchant has to fix first (shown on the app page).
 */
export function buildStarterKit(source: StarterKitSource): StarterKitBuild {
  const problems: string[] = [];
  const { kit } = source;

  if (!kit) {
    problems.push(`Create the kit product with the handle "${STARTER_KIT.kitHandle}".`);
  } else {
    if (kit.status !== "ACTIVE") problems.push("The kit product isn't active.");
    if (kit.variants.length !== 1) problems.push("The kit product must have exactly one variant.");
    else if (!kit.variants[0].requiresComponents) {
      problems.push("The kit variant must require components (requiresComponents).");
    }
  }

  const recipes = source.recipes
    .flatMap((product) => {
      const variant = product.variants.find((v) => v.title === STARTER_KIT.recipeVariantTitle);
      const option = variant ? toOption(product.handle, product.title, variant) : null;
      return option ? [option] : [];
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  if (recipes.length === 0) {
    problems.push(`No active dry cat food has a ${STARTER_KIT.recipeVariantTitle} variant.`);
  }

  const treats = (source.treats?.status === "ACTIVE" ? source.treats.variants : []).flatMap((variant) => {
    const option = toOption(toOptionValue(variant.title), variant.title, variant);
    return option ? [option] : [];
  });
  if (treats.length === 0) {
    problems.push(`The treats product "${STARTER_KIT.treatsHandle}" is missing, inactive or has no priced variants.`);
  }

  if (problems.length > 0 || !kit) return { ok: false, problems };

  const defaultRecipe = pickDefault(recipes, STARTER_KIT.defaultRecipe);
  const defaultTreat = pickDefault(treats, STARTER_KIT.defaultTreat);
  const strip = ({ value, label }: FunctionOption) => ({ value, label });

  return {
    ok: true,
    functionConfig: { kitVariantId: kit.variants[0].id, recipes, treats, defaultRecipe, defaultTreat },
    picker: {
      productId: Number(kit.legacyResourceId),
      recipes: recipes.map(strip),
      treats: treats.map(strip),
      defaultRecipe,
      defaultTreat,
    },
  };
}

/**
 * True when the saved configuration differs from a fresh build: a product,
 * price or option changed since the last save.
 */
export function isOutdated(saved: unknown, fresh: StarterKitFunctionConfig): boolean {
  return stableStringify(saved) !== stableStringify(fresh);
}

/** JSON with object keys sorted, so key order never counts as a change. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
