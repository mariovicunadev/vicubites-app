import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guard: storefront Liquid, checkout UI extensions and Functions receive
 * translated text (metafield text, product type, option names and values).
 * Logic must key on language-independent values: metaobject handles, IDs and
 * `custom.bag_grams`. This scans the source for the patterns that broke in
 * Spanish so they can't come back.
 */
const ROOT = join(__dirname, "..", "..", "..");
const SCANNED = [join(ROOT, "extensions"), join(ROOT, "app", "lib")];
const SKIP_DIRS = new Set(["node_modules", "dist", "generated", "types"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : sourceFiles(path);
    const isSource = /\.(ts|tsx|liquid|graphql)$/.test(name) && !/\.test\.tsx?$/.test(name) && name !== "schema.graphql";
    return isSource ? [path] : [];
  });
}

/** English labels of the product keys: translated on the storefront, so never compared. */
const LABEL = "(Dog|Cat|Dry|Wet|Treats|Chicken|Salmon|Lamb|Turkey|Beef)";
const inExtensions = (file: string) => file.includes(`${sep}extensions${sep}`);

const RULES: { name: string; pattern: RegExp; applies: (file: string) => boolean }[] = [
  {
    name: "compares against an English species, food type or protein label",
    pattern: new RegExp(`(===?|!==?)\\s*["']${LABEL}["']|["']${LABEL}["']\\s*(===?|!==?)|includes\\(\\s*["']${LABEL}["']`),
    applies: () => true,
  },
  {
    name: "reads the product type in a storefront, checkout or Function surface",
    pattern: /\bproductType\b|\bproduct\.type\b/,
    applies: inExtensions,
  },
  {
    name: "keys on the translatable Size option name",
    pattern: /["']Size["']|SIZE_OPTION|options_by_name/,
    applies: () => true,
  },
  {
    name: "reads a product key metafield as text instead of its handle or label",
    pattern: /custom\.(species|food_type|main_protein)\.value(?!\.(system\.handle|label))/,
    applies: (file) => file.endsWith(".liquid"),
  },
];

describe("logic never keys on translatable text", () => {
  const files = SCANNED.flatMap(sourceFiles);

  it("scans the extensions and the app library", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(RULES.map((rule) => [rule.name, rule] as const))("no source %s", (_, rule) => {
    const hits = files
      .filter(rule.applies)
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, index) => (rule.pattern.test(line) ? [`${relative(ROOT, file)}:${index + 1}: ${line.trim()}`] : [])),
      );
    expect(hits).toEqual([]);
  });

  it("catches the patterns it guards against", () => {
    const [labels, productType, size, liquidText] = RULES.map((rule) => rule.pattern);
    expect(labels.test('if (species === "Dog")')).toBe(true);
    expect(labels.test("if species == 'dog'")).toBe(false);
    expect(productType.test("isDryFood(merchandise.product.productType)")).toBe(true);
    expect(size.test('option.name === "Size"')).toBe(true);
    expect(liquidText.test("assign s = product.metafields.custom.species.value | downcase")).toBe(true);
    expect(liquidText.test("assign s = product.metafields.custom.species.value.system.handle")).toBe(false);
  });
});
