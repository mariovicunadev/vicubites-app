import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { assertNoUserErrors } from "../admin/errors";
import { REFILL_METAFIELDS_SET } from "./metafields";
import type { OrderData } from "./orders";

type AdminGraphql = AdminApiContext["graphql"];

/**
 * Stores the reminder choice an order carries (set by the buyer in checkout)
 * and mirrors it to the customer's `$app:refill_reminders` metafield, which
 * the customer account page reads. The latest order wins: a replayed or late
 * webhook for an older order changes nothing. Returns whether it was stored.
 */
export async function recordPreference(graphql: AdminGraphql, shop: string, order: OrderData): Promise<boolean> {
  const { customerId, refillReminders: reminders } = order;
  if (!customerId || reminders === null) return false;

  const decidedAt = new Date(order.processedAt);
  const current = await prisma.refillPreference.findUnique({ where: { shop_customerId: { shop, customerId } } });
  if (current && current.decidedAt > decidedAt) return false;

  await prisma.refillPreference.upsert({
    where: { shop_customerId: { shop, customerId } },
    create: { shop, customerId, reminders, orderId: order.id, decidedAt },
    update: { reminders, orderId: order.id, decidedAt },
  });
  const { metafieldsSet } = await adminGraphql(graphql, REFILL_METAFIELDS_SET, {
    variables: {
      metafields: [
        { ownerId: customerId, namespace: "$app", key: "refill_reminders", type: "boolean", value: String(reminders) },
      ],
    },
  });
  assertNoUserErrors("metafieldsSet", metafieldsSet?.userErrors);
  return true;
}

/** The customers among `customerIds` who turned refill reminders off. */
export async function optedOutCustomers(shop: string, customerIds: string[]): Promise<Set<string>> {
  if (customerIds.length === 0) return new Set();
  const rows = await prisma.refillPreference.findMany({
    where: { shop, reminders: false, customerId: { in: customerIds } },
    select: { customerId: true },
  });
  return new Set(rows.map((row) => row.customerId));
}

export function countOptedOut(shop: string): Promise<number> {
  return prisma.refillPreference.count({ where: { shop, reminders: false } });
}
