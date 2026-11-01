import type { BulkNode } from "../bulk/jsonl";
import { csvRow } from "../bulk/csv";

/** Prefix of the aliased `publishedOnPublication` fields, one per B2B catalog. */
export const B2B_FIELD_PREFIX = "b2b_";

const PUBLICATION_GID = /^gid:\/\/shopify\/Publication\/(\d+)$/;

export interface CatalogQueryOptions {
  /** Publications of the B2B catalogs to check each product against. */
  b2bPublicationIds?: readonly string[];
}

/**
 * Bulk query for the full catalog: products with their variants, metafields
 * and media. Four connections, two levels deep (bulk limits: five and two).
 * Plain string, not `#graphql`: it runs inside `bulkOperationRunQuery`, which
 * takes no variables, so publication IDs are validated and inlined. Each one
 * adds a scalar field (`b2b_<id>: publishedOnPublication`), not a connection.
 */
export function catalogQuery({ b2bPublicationIds = [] }: CatalogQueryOptions = {}): string {
  const b2bFields = b2bPublicationIds.map((id) => {
    const match = PUBLICATION_GID.exec(id);
    if (!match) throw new Error(`Not a publication ID: ${id}`);
    return `\n        ${B2B_FIELD_PREFIX}${match[1]}: publishedOnPublication(publicationId: "${id}")`;
  });

  return `{
  products {
    edges {
      node {
        id
        title
        handle
        status
        productType
        vendor
        requiresSellingPlan${b2bFields.join("")}
        variants {
          edges {
            node {
              id
              title
              sku
              price
            }
          }
        }
        metafields {
          edges {
            node {
              id
              namespace
              key
              type
              value
            }
          }
        }
        media {
          edges {
            node {
              id
              alt
              mediaContentType
            }
          }
        }
      }
    }
  }
}`;
}

export const CATALOG_EXPORT_QUERY = catalogQuery();

const BASE_COLUMNS = [
  "product_id",
  "handle",
  "title",
  "status",
  "product_type",
  "vendor",
  "variant_id",
  "variant_title",
  "sku",
  "price",
  "media_count",
  "media_missing_alt",
] as const;

function field(node: BulkNode | undefined, name: string): unknown {
  return node?.record[name];
}

function metafieldColumn(node: BulkNode): string {
  return `${String(field(node, "namespace"))}.${String(field(node, "key"))}`;
}

/** Media children come back as `MediaImage`, `Video`, `ExternalVideo` or `Model3d`. */
function mediaOf(product: BulkNode): BulkNode[] {
  return ["MediaImage", "Video", "ExternalVideo", "Model3d"].flatMap(
    (type) => product.children[type] ?? [],
  );
}

/**
 * One CSV row per variant (a product without variants still gets a row).
 * Every metafield found in the export becomes a `namespace.key` column.
 */
export function* catalogCsv(products: readonly BulkNode[]): Generator<string> {
  const metafieldColumns = [
    ...new Set(
      products.flatMap((product) =>
        (product.children.Metafield ?? []).map(metafieldColumn),
      ),
    ),
  ].sort();

  yield csvRow([...BASE_COLUMNS, ...metafieldColumns]);

  for (const product of products) {
    const metafields = new Map(
      (product.children.Metafield ?? []).map((node) => [
        metafieldColumn(node),
        field(node, "value"),
      ]),
    );
    const media = mediaOf(product);
    const missingAlt = media.filter((node) => !field(node, "alt")).length;
    const variants = product.children.ProductVariant ?? [];

    for (const variant of variants.length > 0 ? variants : [undefined]) {
      yield csvRow([
        field(product, "id"),
        field(product, "handle"),
        field(product, "title"),
        field(product, "status"),
        field(product, "productType"),
        field(product, "vendor"),
        field(variant, "id"),
        field(variant, "title"),
        field(variant, "sku"),
        field(variant, "price"),
        media.length,
        missingAlt,
        ...metafieldColumns.map((column) => metafields.get(column)),
      ]);
    }
  }
}
