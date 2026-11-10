/** Writes Refill Radar's app-owned customer metafields (forecast and reminder choice). */
export const REFILL_METAFIELDS_SET = `#graphql
  mutation refillMetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        key
      }
      userErrors {
        field
        message
      }
    }
  }
`;
