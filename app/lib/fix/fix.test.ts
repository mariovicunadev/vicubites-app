import { describe, expect, it } from "vitest";

import { csvRecords, parseCsv } from "./csv-parse";
import { FIX_FIELDS, TEMPLATE_COLUMNS } from "./fields";
import { fixVariablesJsonl } from "./jsonl";
import { planFix, type CurrentProduct, type PlannedProduct } from "./plan";
import { countOutcomes, joinFixResults } from "./results";
import { fixTemplateCsv } from "./template";

const KITTEN = "gid://shopify/Product/1";
const STEW = "gid://shopify/Product/2";

const CURRENT = new Map<string, CurrentProduct>([
  [KITTEN, { id: KITTEN, title: "Kitten Turkey Recipe", metafields: {} }],
  [
    STEW,
    {
      id: STEW,
      title: "Hearty Stew for Dogs",
      metafields: { "custom.protein_min": "8.0", "custom.species": "Dog" },
    },
  ],
]);

const CHOICES = new Map<string, readonly string[]>([
  ["custom.species", ["Dog", "Cat"]],
  ["custom.life_stage", ["Puppy", "Kitten", "Adult", "Senior"]],
  ["custom.food_type", ["Dry", "Wet", "Treats"]],
  ["custom.main_protein", ["Chicken", "Salmon", "Lamb", "Turkey", "Beef"]],
]);

function plan(csv: string) {
  return planFix({ ...csvRecords(csv), current: CURRENT, choices: CHOICES });
}

describe("parseCsv", () => {
  it("handles quotes, commas, line breaks, CRLF and a BOM", () => {
    const text = '\uFEFFa,b\r\n"x, y","say ""hi"""\r\n"two\nlines",z\r\n';

    expect(parseCsv(text)).toEqual([
      { line: 1, cells: ["a", "b"] },
      { line: 2, cells: ["x, y", 'say "hi"'] },
      { line: 3, cells: ["two\nlines", "z"] },
    ]);
  });

  it("drops empty rows but keeps spreadsheet line numbers", () => {
    expect(parseCsv("a\n\n,\nb")).toEqual([
      { line: 1, cells: ["a"] },
      { line: 4, cells: ["b"] },
    ]);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseCsv('a\n"open')).toThrow("quoted field");
  });

  it("keys rows by trimmed column names and fills missing cells", () => {
    expect(csvRecords(" product_id ,title\n1").records).toEqual([
      { line: 2, values: { product_id: "1", title: "" } },
    ]);
  });
});

describe("planFix", () => {
  it("plans only filled cells that differ from the current value", () => {
    const result = plan(
      [
        "product_id,title,custom.protein_min,custom.kcal_per_kg,custom.species,custom.life_stage",
        `${KITTEN},Kitten Turkey Recipe,36.5,4100,cat,Kitten`,
        `${STEW},Hearty Stew for Dogs,8,,Dog,`,
      ].join("\n"),
    );

    expect(result.fileErrors).toEqual([]);
    expect(result.rowErrors).toEqual([]);
    expect(result.unchanged).toBe(1);
    expect(result.products).toEqual([
      {
        productId: KITTEN,
        title: "Kitten Turkey Recipe",
        line: 2,
        changes: [
          { key: "custom.protein_min", label: "Crude protein (min)", type: "number_decimal", from: null, to: "36.5" },
          { key: "custom.kcal_per_kg", label: "kcal per kg", type: "number_integer", from: null, to: "4100" },
          // Matched case-insensitively, written with the store's casing.
          { key: "custom.species", label: "Species", type: "single_line_text_field", from: null, to: "Cat" },
          { key: "custom.life_stage", label: "Life stage", type: "single_line_text_field", from: null, to: "Kitten" },
        ],
      },
    ]);
  });

  it("skips a whole row with any invalid value", () => {
    const result = plan(
      [
        "product_id,custom.protein_min,custom.fat_min,custom.kcal_per_kg,custom.main_protein",
        `${KITTEN},36,abc,41.5,Duck`,
      ].join("\n"),
    );

    expect(result.products).toEqual([]);
    expect(result.rowErrors).toEqual([
      {
        line: 2,
        productId: KITTEN,
        messages: [
          'Crude fat (min): "abc" is not a percentage between 0 and 100',
          'kcal per kg: "41.5" is not a whole number',
          'Main protein: "Duck" isn\'t one of Chicken, Salmon, Lamb, Turkey, Beef',
        ],
      },
    ]);
  });

  it("reports unknown, missing and repeated products", () => {
    const result = plan(
      [
        "product_id,custom.protein_min",
        "gid://shopify/Product/999,30",
        ",30",
        `${KITTEN},30`,
        `${KITTEN},31`,
      ].join("\n"),
    );

    expect(result.rowErrors.map((error) => [error.line, error.messages[0]])).toEqual([
      [2, "Unknown product"],
      [3, "Missing product_id"],
      [5, "Product appears more than once"],
    ]);
    expect(result.products.map((product) => product.line)).toEqual([4]);
  });

  it("rejects files without product_id, with unknown columns or without rows", () => {
    expect(plan("title\nX").fileErrors).toEqual(["The file has no product_id column."]);
    expect(plan(`product_id,custom.ingredients\n${KITTEN},x`).fileErrors).toEqual([
      "Unknown columns: custom.ingredients.",
    ]);
    expect(plan("product_id").fileErrors).toEqual(["The file has no rows."]);
  });

  it("rejects percentages over 100", () => {
    expect(plan(`product_id,custom.moisture_max\n${KITTEN},120`).rowErrors).toHaveLength(1);
  });
});

describe("fixVariablesJsonl", () => {
  it("writes one metafieldsSet line per product, in plan order", () => {
    const products: PlannedProduct[] = [
      {
        productId: KITTEN,
        title: "Kitten Turkey Recipe",
        line: 2,
        changes: [
          { key: "custom.kcal_per_kg", label: "kcal per kg", type: "number_integer", from: null, to: "4100" },
        ],
      },
      {
        productId: STEW,
        title: "Hearty Stew for Dogs",
        line: 3,
        changes: [
          { key: "custom.species", label: "Species", type: "single_line_text_field", from: null, to: "Dog" },
        ],
      },
    ];

    const lines = fixVariablesJsonl(products).trimEnd().split("\n").map((line) => JSON.parse(line));

    expect(lines).toEqual([
      { metafields: [{ ownerId: KITTEN, namespace: "custom", key: "kcal_per_kg", type: "number_integer", value: "4100" }] },
      { metafields: [{ ownerId: STEW, namespace: "custom", key: "species", type: "single_line_text_field", value: "Dog" }] },
    ]);
  });
});

describe("joinFixResults", () => {
  const products = [KITTEN, STEW, "gid://shopify/Product/3"].map((productId, index) => ({
    productId,
    title: `Product ${index}`,
    line: index + 2,
    changes: [],
  }));

  it("matches results by __lineNumber and reports errors and missing lines", () => {
    const outcomes = joinFixResults(products, [
      {
        data: {
          metafieldsSet: {
            metafields: null,
            userErrors: [{ field: ["metafields", "0", "value"], message: "Value is invalid" }],
          },
        },
        __lineNumber: 1,
      },
      { data: { metafieldsSet: { metafields: [{ id: "m1" }], userErrors: [] } }, __lineNumber: 0 },
    ]);

    expect(outcomes.map((outcome) => [outcome.status, outcome.messages])).toEqual([
      ["applied", []],
      ["failed", ["metafields.0.value: Value is invalid"]],
      ["missing", ["No result: the operation stopped early"]],
    ]);
    expect(countOutcomes(outcomes)).toEqual({ applied: 1, failed: 1, missing: 1 });
  });

  it("reports top-level GraphQL errors, matched by position when the line number is absent", () => {
    const outcomes = joinFixResults(products.slice(0, 1), [
      { errors: [{ message: "Variable $metafields was provided invalid value" }] },
    ]);

    expect(outcomes[0]).toMatchObject({
      status: "failed",
      messages: ["Variable $metafields was provided invalid value"],
    });
  });
});

describe("fixTemplateCsv", () => {
  it("starts with a BOM and the template columns, with current values filled", () => {
    const csv = fixTemplateCsv([{ ...CURRENT.get(STEW)!, handle: "hearty-stew" }]);
    const [header, row] = parseCsv(csv);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(header.cells).toEqual(TEMPLATE_COLUMNS);
    expect(row.cells).toEqual([
      STEW,
      "hearty-stew",
      "Hearty Stew for Dogs",
      ...FIX_FIELDS.map((field) => (field.key === "custom.protein_min" ? "8.0" : field.key === "custom.species" ? "Dog" : "")),
    ]);
  });
});
