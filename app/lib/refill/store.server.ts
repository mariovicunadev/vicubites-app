import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { assertNoUserErrors } from "../admin/errors";
import { createBulkJob, latestBulkJob, refreshJob } from "../bulk/jobs.server";
import { downloadBulkResult } from "../bulk/operations.server";
import { forecastCustomer, lastVariants, type Forecast, type Purchase, type Species } from "./forecast";
import {
  orderFromBulkNode,
  orderFromQuery,
  purchasesFromOrder,
  REFILL_ORDERS_BULK_QUERY,
  type OrderData,
} from "./orders";

type AdminGraphql = AdminApiContext["graphql"];

/** The order fields the forecast reads; the same ones the bulk load reads. */
const REFILL_ORDER_QUERY = `#graphql
  query refillOrder($id: ID!) {
    order(id: $id) {
      id
      processedAt
      customer {
        id
      }
      purchasingEntity {
        __typename
      }
      lineItems(first: 100) {
        nodes {
          quantity
          variant {
            id
            selectedOptions {
              name
              value
            }
            product {
              species: metafield(namespace: "custom", key: "species") {
                value
              }
              kcalPerKg: metafield(namespace: "custom", key: "kcal_per_kg") {
                value
              }
            }
          }
        }
      }
    }
  }
`;

const REFILL_METAFIELDS_SET = `#graphql
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

export async function fetchOrder(graphql: AdminGraphql, orderId: string): Promise<OrderData | null> {
  const { order } = await adminGraphql(graphql, REFILL_ORDER_QUERY, { variables: { id: orderId } });
  return order ? orderFromQuery(order) : null;
}

/** Stores an order's dry food purchases. Upserts, so replays change nothing. */
export async function recordOrder(shop: string, order: OrderData): Promise<Purchase[]> {
  const purchases = purchasesFromOrder(order);
  const customerId = order.customerId;
  if (!customerId) return purchases;
  await prisma.$transaction(
    purchases.map((purchase) =>
      prisma.refillPurchase.upsert({
        where: { shop_orderId_species: { shop, orderId: purchase.orderId, species: purchase.species } },
        create: { shop, customerId, ...purchase, processedAt: new Date(purchase.processedAt) },
        update: {
          customerId,
          kcal: purchase.kcal,
          variantId: purchase.variantId,
          processedAt: new Date(purchase.processedAt),
        },
      }),
    ),
  );
  return purchases;
}

/**
 * Recomputes a customer's forecasts from their stored purchases, saves them
 * and writes them to the customer's app-owned metafields.
 */
export async function refreshCustomer(graphql: AdminGraphql, shop: string, customerId: string) {
  const rows = await prisma.refillPurchase.findMany({ where: { shop, customerId } });
  const purchases: Purchase[] = rows.map((row) => ({
    orderId: row.orderId,
    processedAt: row.processedAt.toISOString(),
    species: row.species as Species,
    kcal: row.kcal,
    variantId: row.variantId,
  }));
  const forecasts = forecastCustomer(purchases);

  await prisma.$transaction([
    prisma.refillForecast.deleteMany({ where: { shop, customerId } }),
    ...forecasts.map((forecast) => prisma.refillForecast.create({ data: { shop, customerId, ...forecast } })),
  ]);
  if (forecasts.length > 0) await writeMetafields(graphql, customerId, forecasts, lastVariants(purchases));
  return forecasts;
}

async function writeMetafields(
  graphql: AdminGraphql,
  customerId: string,
  forecasts: Forecast[],
  variantIds: string[],
) {
  const { metafieldsSet } = await adminGraphql(graphql, REFILL_METAFIELDS_SET, {
    variables: {
      metafields: [
        {
          ownerId: customerId,
          namespace: "$app",
          key: "refill_run_out",
          type: "date",
          // Forecasts are sorted earliest first.
          value: forecasts[0].runOutOn,
        },
        {
          ownerId: customerId,
          namespace: "$app",
          key: "refill_forecast",
          type: "json",
          value: JSON.stringify(forecasts),
        },
        // A list metafield can't be empty: skipped when no purchase has a variant left.
        ...(variantIds.length > 0
          ? [
              {
                ownerId: customerId,
                namespace: "$app",
                key: "refill_variants",
                type: "list.variant_reference",
                value: JSON.stringify(variantIds),
              },
            ]
          : []),
      ],
    },
  });
  assertNoUserErrors("metafieldsSet", metafieldsSet?.userErrors);
}

/** Starts the initial load: one bulk query over the orders the app can read. */
export function startRefillLoad(graphql: AdminGraphql, shop: string) {
  return createBulkJob(graphql, shop, "refill", REFILL_ORDERS_BULK_QUERY);
}

/**
 * Consumes the latest load once its bulk operation has completed: replaces
 * the shop's purchases and recomputes every customer. Claimed with a
 * conditional update, like the audit, so it runs once.
 */
export async function processLatestRefillLoad(graphql: AdminGraphql, shop: string) {
  let job = await latestBulkJob(shop, "refill");
  if (!job || job.processedAt || job.status !== "COMPLETED") return job;
  if (!job.url) job = await refreshJob(graphql, job);
  if (!job.url) return job;

  const claimed = await prisma.bulkJob.updateMany({
    where: { id: job.id, processedAt: null },
    data: { processedAt: new Date() },
  });
  if (claimed.count === 0) return job;

  try {
    const orders = (await downloadBulkResult(job.url)).map(orderFromBulkNode);
    const purchases = orders.flatMap((order) =>
      purchasesFromOrder(order).map((purchase) => ({ ...purchase, customerId: order.customerId ?? "" })),
    );
    await prisma.$transaction([
      prisma.refillPurchase.deleteMany({ where: { shop } }),
      prisma.refillForecast.deleteMany({ where: { shop } }),
      ...purchases.map((purchase) =>
        prisma.refillPurchase.create({
          data: { shop, ...purchase, processedAt: new Date(purchase.processedAt) },
        }),
      ),
    ]);
    for (const customerId of new Set(purchases.map((purchase) => purchase.customerId))) {
      await refreshCustomer(graphql, shop, customerId);
    }
  } catch (error) {
    // Release the claim so the next page load retries.
    await prisma.bulkJob.update({ where: { id: job.id }, data: { processedAt: null } });
    throw error;
  }
  return prisma.bulkJob.findUnique({ where: { id: job.id } });
}

export function loadForecasts(shop: string) {
  return prisma.refillForecast.findMany({ where: { shop }, orderBy: [{ runOutOn: "asc" }, { customerId: "asc" }] });
}
