import { describe, expect, it } from "vitest";

import { parseStarterKitConfig } from "../../../extensions/starter-kit-expand/src/starter-kit";
import { STARTER_KIT, buildStarterKit, isOutdated, toOptionValue, type StarterKitSource } from "./starter-kit";

const variant = (id: number, title: string, price: string) => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title,
  price,
});

const recipe = (handle: string, title: string, price = "21.99") => ({
  handle,
  title,
  variants: [variant(handle.length * 10, "1.5 kg", price), variant(handle.length * 10 + 1, "4 kg", "46.99")],
});

/** A store with everything in place; each test changes one thing. */
function source(overrides: Partial<StarterKitSource> = {}): StarterKitSource {
  return {
    kit: {
      legacyResourceId: "9001",
      status: "ACTIVE",
      variants: [{ id: "gid://shopify/ProductVariant/100", requiresComponents: true }],
    },
    recipes: [
      recipe("adult-salmon-recipe-dry-cat-food", "Adult Salmon Recipe"),
      recipe(STARTER_KIT.defaultRecipe, "Adult Chicken & Turkey Recipe", "19.99"),
    ],
    treats: {
      status: "ACTIVE",
      variants: [variant(301, "Salmon", "6.99"), variant(302, "Chicken", "6.99")],
    },
    ...overrides,
  };
}

describe("buildStarterKit", () => {
  it("builds the function configuration and the picker from the same options", () => {
    const build = buildStarterKit(source());
    if (!build.ok) throw new Error(build.problems.join(" "));

    expect(build.functionConfig.kitVariantId).toBe("gid://shopify/ProductVariant/100");
    // Sorted by label for the picker; the 1.5 kg bag only.
    expect(build.functionConfig.recipes.map((r) => [r.label, r.weight])).toEqual([
      ["Adult Chicken & Turkey Recipe", 19.99],
      ["Adult Salmon Recipe", 21.99],
    ]);
    expect(build.functionConfig.treats.map((t) => t.value)).toEqual(["salmon", "chicken"]);
    expect(build.picker).toEqual({
      productId: 9001,
      recipes: build.functionConfig.recipes.map(({ value, label }) => ({ value, label })),
      treats: build.functionConfig.treats.map(({ value, label }) => ({ value, label })),
      defaultRecipe: STARTER_KIT.defaultRecipe,
      defaultTreat: "chicken",
    });
  });

  it("builds a configuration the function accepts (contract)", () => {
    const build = buildStarterKit(source());
    if (!build.ok) throw new Error(build.problems.join(" "));
    // Through JSON, as the metafield stores it.
    const stored = JSON.parse(JSON.stringify(build.functionConfig));
    expect(parseStarterKitConfig(stored)).toEqual(build.functionConfig);
  });

  it("falls back to the first option when a preferred default is gone", () => {
    const build = buildStarterKit(
      source({
        recipes: [recipe("adult-salmon-recipe-dry-cat-food", "Adult Salmon Recipe")],
        treats: { status: "ACTIVE", variants: [variant(303, "Turkey", "6.99")] },
      }),
    );
    if (!build.ok) throw new Error(build.problems.join(" "));
    expect(build.functionConfig.defaultRecipe).toBe("adult-salmon-recipe-dry-cat-food");
    expect(build.functionConfig.defaultTreat).toBe("turkey");
  });

  it("leaves out recipes without the kit's bag size and unpriced variants", () => {
    const noSmallBag = { handle: "x", title: "X", variants: [variant(1, "4 kg", "46.99")] };
    const free = recipe("free-recipe", "Free", "0.00");
    const build = buildStarterKit(source({ recipes: [...source().recipes, noSmallBag, free] }));
    if (!build.ok) throw new Error(build.problems.join(" "));
    expect(build.functionConfig.recipes).toHaveLength(2);
  });

  it.each([
    ["no kit product", { kit: null }, "Create the kit product"],
    ["an inactive kit", { kit: { ...source().kit!, status: "DRAFT" } }, "isn't active"],
    ["a kit with two variants", {
      kit: { ...source().kit!, variants: [...source().kit!.variants, ...source().kit!.variants] },
    }, "exactly one variant"],
    ["a kit variant without requiresComponents", {
      kit: { ...source().kit!, variants: [{ id: "gid://shopify/ProductVariant/100", requiresComponents: false }] },
    }, "require components"],
    ["no recipes", { recipes: [] }, "No active dry cat food"],
    ["no treats product", { treats: null }, "treats product"],
    ["an inactive treats product", { treats: { ...source().treats!, status: "DRAFT" } }, "treats product"],
  ])("reports %s", (_, overrides, problem) => {
    const build = buildStarterKit(source(overrides as Partial<StarterKitSource>));
    expect(build.ok).toBe(false);
    if (!build.ok) expect(build.problems.join(" ")).toContain(problem);
  });
});

describe("toOptionValue", () => {
  it.each([
    ["Salmon", "salmon"],
    ["Ocean Fish", "ocean-fish"],
    [" Chicken & Liver ", "chicken-liver"],
  ])("%s → %s", (title, value) => {
    expect(toOptionValue(title)).toBe(value);
  });
});

describe("isOutdated", () => {
  const build = buildStarterKit(source());
  if (!build.ok) throw new Error("fixture");
  const fresh = build.functionConfig;

  it("is false for the same configuration, whatever the key order", () => {
    const reordered = Object.fromEntries(Object.entries(fresh).reverse());
    expect(isOutdated(reordered, fresh)).toBe(false);
  });

  it("is true after a price change or with nothing saved", () => {
    const changed = { ...fresh, treats: [{ ...fresh.treats[0], weight: 7.49 }, fresh.treats[1]] };
    expect(isOutdated(changed, fresh)).toBe(true);
    expect(isOutdated(null, fresh)).toBe(true);
  });
});
