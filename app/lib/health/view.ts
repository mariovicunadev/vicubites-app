import { legacyId } from "./product";
import { RULES_BY_ID } from "./rules";
import type { ProductHealthResult } from "./score";

export type ScoreTone = "success" | "caution" | "critical";

export interface HealthIssue {
  ruleId: string;
  label: string;
  missing: string[];
}

export interface HealthRow {
  productId: string;
  /** Numeric ID for `shopify://admin/products/{id}` links. */
  adminId: string;
  title: string;
  status: string;
  score: number;
  tone: ScoreTone;
  issues: HealthIssue[];
}

/** 100 is complete; below 60 means core nutrition data is missing. */
export function scoreTone(score: number): ScoreTone {
  if (score >= 100) return "success";
  if (score >= 60) return "caution";
  return "critical";
}

export function toHealthRow(result: ProductHealthResult): HealthRow {
  return {
    productId: result.productId,
    adminId: legacyId(result.productId),
    title: result.title,
    status: result.status,
    score: result.score,
    tone: scoreTone(result.score),
    issues: result.results
      .filter((r) => !r.passed)
      .map((r) => ({
        ruleId: r.ruleId,
        label: RULES_BY_ID.get(r.ruleId)?.label ?? r.ruleId,
        missing: r.missing,
      })),
  };
}
