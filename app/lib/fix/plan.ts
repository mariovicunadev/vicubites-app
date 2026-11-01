import type { CsvRecord } from "./csv-parse";
import { FIX_FIELDS, FIX_FIELDS_BY_KEY, ID_COLUMNS, type FixField } from "./fields";

/** Current state of a product, read from the Admin API at preview time. */
export interface CurrentProduct {
  id: string;
  title: string;
  /** Metafield values keyed by `namespace.key`. */
  metafields: Readonly<Record<string, string>>;
}

export interface PlannedChange {
  key: string;
  label: string;
  type: FixField["type"];
  from: string | null;
  to: string;
}

export interface PlannedProduct {
  productId: string;
  title: string;
  /** Spreadsheet line the changes come from. */
  line: number;
  changes: PlannedChange[];
}

export interface RowError {
  line: number;
  productId: string | null;
  messages: string[];
}

export interface FixPlan {
  /** Problems with the file itself: nothing is planned when there are any. */
  fileErrors: string[];
  products: PlannedProduct[];
  /** Rows skipped because of invalid values; nothing is written for them. */
  rowErrors: RowError[];
  /** Valid rows with nothing to change. */
  unchanged: number;
}

export interface PlanInput {
  columns: readonly string[];
  records: readonly CsvRecord[];
  current: ReadonlyMap<string, CurrentProduct>;
  /** Allowed values of choice fields, from the store's metafield definitions. */
  choices: ReadonlyMap<string, readonly string[]>;
}

const KNOWN_COLUMNS: ReadonlySet<string> = new Set([...ID_COLUMNS, ...FIX_FIELDS_BY_KEY.keys()]);
const DECIMAL = /^\d+(\.\d+)?$/;
const INTEGER = /^\d+$/;

/**
 * Turns uploaded rows into the changes a bulk fix would write. Blank cells
 * mean "no change", values equal to the current one are skipped, and a row
 * with any invalid value is skipped entirely so a product is never half fixed.
 */
export function planFix({ columns, records, current, choices }: PlanInput): FixPlan {
  const fileErrors = fileProblems(columns, records);
  if (fileErrors.length > 0) {
    return { fileErrors, products: [], rowErrors: [], unchanged: 0 };
  }

  const products: PlannedProduct[] = [];
  const rowErrors: RowError[] = [];
  const seen = new Set<string>();
  let unchanged = 0;

  for (const { line, values } of records) {
    const productId = values.product_id || null;
    const product = productId ? current.get(productId) : undefined;
    if (!productId || !product) {
      rowErrors.push({
        line,
        productId,
        messages: [productId ? "Unknown product" : "Missing product_id"],
      });
      continue;
    }
    if (seen.has(productId)) {
      rowErrors.push({ line, productId, messages: ["Product appears more than once"] });
      continue;
    }
    seen.add(productId);

    const messages: string[] = [];
    const changes: PlannedChange[] = [];
    for (const field of FIX_FIELDS) {
      const raw = values[field.key] ?? "";
      if (raw === "") continue;
      const result = normalize(field, raw, choices.get(field.key));
      if ("error" in result) {
        messages.push(`${field.label}: ${result.error}`);
        continue;
      }
      const from = product.metafields[field.key] ?? null;
      if (from !== null && sameValue(field, from, result.value)) continue;
      changes.push({ key: field.key, label: field.label, type: field.type, from, to: result.value });
    }

    if (messages.length > 0) rowErrors.push({ line, productId, messages });
    else if (changes.length === 0) unchanged += 1;
    else products.push({ productId, title: product.title, line, changes });
  }

  return { fileErrors: [], products, rowErrors, unchanged };
}

function fileProblems(columns: readonly string[], records: readonly CsvRecord[]): string[] {
  const problems: string[] = [];
  if (!columns.includes("product_id")) problems.push("The file has no product_id column.");
  const unknown = columns.filter((column) => column !== "" && !KNOWN_COLUMNS.has(column));
  if (unknown.length > 0) problems.push(`Unknown columns: ${unknown.join(", ")}.`);
  if (problems.length === 0 && records.length === 0) problems.push("The file has no rows.");
  return problems;
}

function normalize(
  field: FixField,
  raw: string,
  allowed: readonly string[] | undefined,
): { value: string } | { error: string } {
  switch (field.kind) {
    case "decimal":
      // Guaranteed analysis values are percentages.
      return DECIMAL.test(raw) && Number(raw) <= 100
        ? { value: raw }
        : { error: `"${raw}" is not a percentage between 0 and 100` };
    case "integer":
      return INTEGER.test(raw) ? { value: raw } : { error: `"${raw}" is not a whole number` };
    case "choice": {
      const match = allowed?.find((choice) => choice.toLowerCase() === raw.toLowerCase());
      if (match) return { value: match };
      return allowed
        ? { error: `"${raw}" isn't one of ${allowed.join(", ")}` }
        : { error: "the store has no allowed values for this field" };
    }
  }
}

function sameValue(field: FixField, a: string, b: string): boolean {
  return field.kind === "choice" ? a === b : Number(a) === Number(b);
}
