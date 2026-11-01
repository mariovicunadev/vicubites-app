import type { BulkRecord } from "../bulk/jsonl";
import type { PlannedProduct } from "./plan";

export type FixStatus = "applied" | "failed" | "missing";

export interface FixOutcome {
  productId: string;
  title: string;
  status: FixStatus;
  messages: string[];
}

interface ResultLine {
  data?: {
    metafieldsSet?: {
      userErrors?: { message: string; field?: string[] | null }[];
    } | null;
  } | null;
  errors?: { message: string }[];
  __lineNumber?: number;
}

/**
 * Joins the result file to the plan. Each result line answers the input line
 * with the same `__lineNumber` (0-based); a line without one is matched by
 * position. A product with no result line (the operation stopped early) is
 * reported as missing rather than applied.
 */
export function joinFixResults(
  products: readonly PlannedProduct[],
  records: readonly BulkRecord[],
): FixOutcome[] {
  const byLine = new Map<number, ResultLine>();
  records.forEach((record, position) => {
    const result = record as ResultLine;
    byLine.set(typeof result.__lineNumber === "number" ? result.__lineNumber : position, result);
  });

  return products.map((product, index) => {
    const result = byLine.get(index);
    const base = { productId: product.productId, title: product.title };
    if (!result) {
      return { ...base, status: "missing", messages: ["No result: the operation stopped early"] };
    }
    const messages = [
      ...(result.errors ?? []).map((error) => error.message),
      ...(result.data?.metafieldsSet?.userErrors ?? []).map(formatUserError),
    ];
    if (!result.data?.metafieldsSet && messages.length === 0) {
      messages.push("Shopify returned no data for this line");
    }
    return { ...base, status: messages.length > 0 ? "failed" : "applied", messages };
  });
}

function formatUserError({ message, field }: { message: string; field?: string[] | null }) {
  return field && field.length > 0 ? `${field.join(".")}: ${message}` : message;
}

export function countOutcomes(outcomes: readonly FixOutcome[]): Record<FixStatus, number> {
  const counts: Record<FixStatus, number> = { applied: 0, failed: 0, missing: 0 };
  for (const outcome of outcomes) counts[outcome.status] += 1;
  return counts;
}
