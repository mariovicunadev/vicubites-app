import type { RuleId } from "../health/rules";

export type FixFieldKind = "decimal" | "integer" | "choice";

export interface FixField {
  /** Metafield `namespace.key`, also the CSV column name (as in the catalog export). */
  key: string;
  label: string;
  kind: FixFieldKind;
  /** Metafield type sent to `metafieldsSet`. */
  type: "number_decimal" | "number_integer" | "single_line_text_field";
  ruleId: RuleId;
}

/**
 * Fields a bulk fix can write. Values come from the manufacturer, so the app
 * only moves them from a spreadsheet into the catalog; choice fields are
 * checked against the store's metafield definitions at preview time.
 */
export const FIX_FIELDS = [
  { key: "custom.protein_min", label: "Crude protein (min)", kind: "decimal", type: "number_decimal", ruleId: "guaranteed-analysis" },
  { key: "custom.fat_min", label: "Crude fat (min)", kind: "decimal", type: "number_decimal", ruleId: "guaranteed-analysis" },
  { key: "custom.fiber_max", label: "Crude fiber (max)", kind: "decimal", type: "number_decimal", ruleId: "guaranteed-analysis" },
  { key: "custom.moisture_max", label: "Moisture (max)", kind: "decimal", type: "number_decimal", ruleId: "guaranteed-analysis" },
  { key: "custom.kcal_per_kg", label: "kcal per kg", kind: "integer", type: "number_integer", ruleId: "calories" },
  { key: "custom.species", label: "Species", kind: "choice", type: "single_line_text_field", ruleId: "classification" },
  { key: "custom.life_stage", label: "Life stage", kind: "choice", type: "single_line_text_field", ruleId: "classification" },
  { key: "custom.food_type", label: "Food type", kind: "choice", type: "single_line_text_field", ruleId: "classification" },
  { key: "custom.main_protein", label: "Main protein", kind: "choice", type: "single_line_text_field", ruleId: "classification" },
] as const satisfies readonly FixField[];

export const FIX_FIELDS_BY_KEY: ReadonlyMap<string, FixField> = new Map(
  FIX_FIELDS.map((field) => [field.key, field]),
);

/** Rules a bulk fix can make pass. */
export const FIXABLE_RULES: ReadonlySet<RuleId> = new Set(FIX_FIELDS.map((field) => field.ruleId));

/** Columns that identify the product; `handle` and `title` are for the person editing. */
export const ID_COLUMNS = ["product_id", "handle", "title"] as const;

/**
 * `namespace.key` for a metafield node. Filtering a connection with
 * `metafields(keys: [...])` returns `key` already prefixed with the
 * namespace, while `metafields(namespace:)` returns the bare key.
 */
export function metafieldKey(namespace: string, key: string): string {
  return key.startsWith(`${namespace}.`) ? key : `${namespace}.${key}`;
}

export const TEMPLATE_COLUMNS = [...ID_COLUMNS, ...FIX_FIELDS.map((field) => field.key)];
