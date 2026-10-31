import type { ProductData } from "./product";
import { RULES, type HealthRule, type RuleId } from "./rules";

export interface RuleResult {
  ruleId: RuleId;
  passed: boolean;
  missing: string[];
}

export interface ProductHealthResult {
  productId: string;
  title: string;
  handle: string;
  status: string;
  /** 0–100: the sum of the weights of the rules the product passes. */
  score: number;
  results: RuleResult[];
}

export interface RuleSummary {
  ruleId: RuleId;
  label: string;
  passing: number;
  total: number;
}

export interface CatalogHealthSummary {
  products: number;
  averageScore: number;
  needsAttention: number;
  rules: RuleSummary[];
}

export function evaluateProduct(
  product: ProductData,
  rules: readonly (HealthRule & { id: RuleId })[] = RULES,
): ProductHealthResult {
  const results = rules.map((rule) => {
    const missing = rule.check(product);
    return { ruleId: rule.id, passed: missing.length === 0, missing };
  });
  const score = rules.reduce(
    (total, rule, index) => (results[index].passed ? total + rule.weight : total),
    0,
  );

  return {
    productId: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    score,
    results,
  };
}

export function failedRules(result: Pick<ProductHealthResult, "results">): RuleId[] {
  return result.results.filter((r) => !r.passed).map((r) => r.ruleId);
}

/** Catalog-wide numbers for the summary cards and the per-rule bars. */
export function summarize(
  results: readonly Pick<ProductHealthResult, "score" | "results">[],
  rules: readonly (HealthRule & { id: RuleId })[] = RULES,
): CatalogHealthSummary {
  const total = results.length;
  const scoreSum = results.reduce((sum, result) => sum + result.score, 0);

  return {
    products: total,
    averageScore: total === 0 ? 0 : Math.round(scoreSum / total),
    needsAttention: results.filter((result) => result.score < 100).length,
    rules: rules.map((rule) => ({
      ruleId: rule.id,
      label: rule.label,
      passing: results.filter((result) =>
        result.results.some((r) => r.ruleId === rule.id && r.passed),
      ).length,
      total,
    })),
  };
}
