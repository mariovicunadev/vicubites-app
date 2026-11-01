import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { loadB2bPublicationIds } from "./b2b.server";
import { productFromGraphql } from "./live";
import { evaluateProduct, type ProductHealthResult } from "./score";

type AdminGraphql = AdminApiContext["graphql"];

/**
 * The fields the audit's bulk query reads, for one product. B2B coverage
 * comes from the publications the product is published on (`read_publications`).
 */
const PRODUCT_HEALTH_QUERY = `#graphql
  query productHealthData($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      status
      requiresSellingPlan
      variants(first: 250) {
        nodes {
          id
          title
          sku
        }
      }
      metafields(first: 250) {
        nodes {
          namespace
          key
          value
        }
      }
      media(first: 250) {
        nodes {
          id
          alt
        }
      }
      resourcePublicationsV2(first: 250, onlyPublished: true) {
        nodes {
          publication {
            id
          }
        }
      }
    }
  }
` as const;

/** Scores one product from its current data; null when it doesn't exist. */
export async function checkProduct(
  graphql: AdminGraphql,
  productId: string,
): Promise<ProductHealthResult | null> {
  const [data, b2bPublicationIds] = await Promise.all([
    adminGraphql(graphql, PRODUCT_HEALTH_QUERY, { variables: { id: productId } }),
    loadB2bPublicationIds(graphql),
  ]);
  if (!data.product) return null;
  return evaluateProduct(productFromGraphql(data.product, b2bPublicationIds));
}

/**
 * Refreshes the product's row in the audit results. A product the last audit
 * didn't include joins it; before any audit there's nothing to update.
 */
export async function saveLiveResult(shop: string, result: ProductHealthResult) {
  const fields = {
    title: result.title,
    handle: result.handle,
    status: result.status,
    score: result.score,
    results: JSON.stringify(result.results),
    auditedAt: new Date(),
  };

  const updated = await prisma.productHealth.updateMany({
    where: { shop, productId: result.productId },
    data: fields,
  });
  if (updated.count > 0) return;

  const audit = await prisma.bulkJob.findFirst({
    where: { shop, kind: "audit", processedAt: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (!audit) return;

  await prisma.productHealth.upsert({
    where: { shop_productId: { shop, productId: result.productId } },
    create: { shop, productId: result.productId, auditJobId: audit.id, ...fields },
    update: fields,
  });
}
