import { csvRow } from "../bulk/csv";
import { FIX_FIELDS, TEMPLATE_COLUMNS } from "./fields";
import type { CurrentProduct } from "./plan";

/**
 * The spreadsheet merchants fill in: one row per product with gaps, current
 * values filled so only the blanks need the manufacturer's data. The BOM
 * makes Excel open it as UTF-8 (product titles have accents).
 */
export function fixTemplateCsv(products: readonly (CurrentProduct & { handle: string })[]): string {
  const rows = products.map((product) =>
    csvRow([
      product.id,
      product.handle,
      product.title,
      ...FIX_FIELDS.map((field) => product.metafields[field.key] ?? ""),
    ]),
  );
  return `\uFEFF${csvRow(TEMPLATE_COLUMNS)}${rows.join("")}`;
}
