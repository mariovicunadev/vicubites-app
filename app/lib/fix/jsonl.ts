import type { PlannedProduct } from "./plan";

/**
 * The mutation Shopify runs once per JSONL line. Plain string, not
 * `#graphql`: it runs inside `bulkOperationRunMutation`, not through
 * `adminGraphql()`. `metafieldsSet` takes up to 25 metafields per call; a
 * line holds one product, at most nine.
 */
export const FIX_METAFIELDS_MUTATION = `mutation fixMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields {
      id
    }
    userErrors {
      field
      message
      code
    }
  }
}`;

/** One line of variables per product, in plan order: line N is `products[N]`. */
export function fixVariablesJsonl(products: readonly PlannedProduct[]): string {
  return products
    .map((product) =>
      JSON.stringify({
        metafields: product.changes.map((change) => {
          const [namespace, key] = change.key.split(".");
          return { ownerId: product.productId, namespace, key, type: change.type, value: change.to };
        }),
      }),
    )
    .map((line) => `${line}\n`)
    .join("");
}
