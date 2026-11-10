/**
 * Customer metafield definitions Refill Radar declares in `shopify.app.toml`. Shopify creates them on
 * `app deploy`; a definition removed from the store comes back only with a deploy that changes its
 * entry, so the Refill Radar page checks they are all present.
 */
export const DECLARED_CUSTOMER_DEFINITIONS = [
  { key: "refill_run_out", type: "date" },
  { key: "refill_forecast", type: "json" },
  { key: "refill_variants", type: "list.variant_reference" },
  { key: "refill_reminders", type: "boolean" },
] as const;

export interface DefinitionShape {
  key: string;
  type: string;
}

/** The app's (`$app`) customer metafield definitions as they exist in the store. */
export const REFILL_CUSTOMER_DEFINITIONS_QUERY = `#graphql
  query refillCustomerDefinitions {
    metafieldDefinitions(first: 50, ownerType: CUSTOMER, namespace: "$app") {
      nodes {
        key
        type {
          name
        }
      }
    }
  }
`;

/**
 * Declared definitions that are missing in the store or exist with another type.
 * @param declared - What the app configuration declares
 * @param found - What the store returns
 */
export function missingDefinitions(
  declared: readonly DefinitionShape[],
  found: readonly DefinitionShape[],
): DefinitionShape[] {
  return declared.filter(({ key, type }) => !found.some((definition) => definition.key === key && definition.type === type));
}
