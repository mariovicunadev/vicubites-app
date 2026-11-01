import type { ProductData } from "./product";

/** The single-product query result the live check reads (see `live.server.ts`). */
export interface LiveProductNode {
  id: string;
  title: string;
  handle: string;
  status: string;
  requiresSellingPlan: boolean;
  variants: { nodes: readonly { id: string; title: string; sku?: string | null }[] };
  metafields: { nodes: readonly { namespace: string; key: string; value: string }[] };
  media: { nodes: readonly { id: string; alt?: string | null }[] };
  resourcePublicationsV2: { nodes: readonly { publication: { id: string } }[] };
}

const PRODUCT_GID = /^gid:\/\/shopify\/Product\/\d+$/;

/** `123` or `gid://shopify/Product/123` → the product GID; anything else → null. */
export function productGid(id: string): string | null {
  if (/^\d+$/.test(id)) return `gid://shopify/Product/${id}`;
  return PRODUCT_GID.test(id) ? id : null;
}

function optionalText(value: string | null | undefined): string | null {
  return value ? value : null;
}

/**
 * Maps one product read live to the `ProductData` the rules score, the same
 * shape `productFromNode()` builds from the bulk export. B2B coverage is the
 * product's published publications checked against each B2B catalog's.
 */
export function productFromGraphql(
  product: LiveProductNode,
  b2bPublicationIds: readonly string[],
): ProductData {
  const published = new Set(product.resourcePublicationsV2.nodes.map((n) => n.publication.id));
  const metafields: Record<string, string> = {};
  for (const { namespace, key, value } of product.metafields.nodes) {
    metafields[`${namespace}.${key}`] = value;
  }

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: product.status,
    requiresSellingPlan: product.requiresSellingPlan,
    b2bPublished: b2bPublicationIds.map((id) => published.has(id)),
    metafields,
    variants: product.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: optionalText(variant.sku),
    })),
    media: product.media.nodes.map((media) => ({ id: media.id, alt: optionalText(media.alt) })),
  };
}
