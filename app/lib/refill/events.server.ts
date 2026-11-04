import prisma from "../../db.server";
import { FUNNEL_DAYS, orderNumber, reminderFunnel, repeatOrders, type PixelEvent, type ReminderFunnel } from "./events";

/** Pixel events are kept this long, then deleted. */
export const EVENT_RETENTION_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether the app is installed on the shop (it holds an offline session for it). */
export async function isInstalledShop(shop: string): Promise<boolean> {
  return (await prisma.session.count({ where: { shop, isOnline: false } })) > 0;
}

/** Stores one pixel event and deletes the shop's events past retention. */
export async function recordPixelEvent(event: PixelEvent, now = new Date()) {
  const { shop } = event;
  await prisma.$transaction([
    prisma.refillEvent.create({ data: event }),
    prisma.refillEvent.deleteMany({
      where: { shop, createdAt: { lt: new Date(now.getTime() - EVENT_RETENTION_DAYS * DAY_MS) } },
    }),
  ]);
}

export interface ReminderMetrics extends ReminderFunnel {
  /** Dry food reorders from returning customers, counted from order webhooks. */
  repeatOrders: number;
}

export async function loadReminderMetrics(shop: string, now = new Date()): Promise<ReminderMetrics> {
  const since = new Date(now.getTime() - FUNNEL_DAYS * DAY_MS);
  const [events, purchases] = await Promise.all([
    prisma.refillEvent.findMany({
      where: { shop, createdAt: { gte: since } },
      select: { name: true, clientId: true, orderId: true, createdAt: true },
    }),
    prisma.refillPurchase.findMany({
      where: { shop, processedAt: { gte: since } },
      select: { customerId: true, orderId: true, processedAt: true },
    }),
  ]);

  // Each customer's first dry food purchase, which may be older than the window.
  const customerIds = [...new Set(purchases.map((purchase) => purchase.customerId))];
  const firsts = customerIds.length
    ? await prisma.refillPurchase.groupBy({
        by: ["customerId"],
        where: { shop, customerId: { in: customerIds } },
        _min: { processedAt: true },
      })
    : [];
  const firstPurchaseAt = new Map<string, Date>();
  for (const first of firsts) if (first._min.processedAt) firstPurchaseAt.set(first.customerId, first._min.processedAt);

  const dryFoodOrders = new Set(
    purchases.map((purchase) => orderNumber(purchase.orderId)).filter((id): id is string => id !== null),
  );
  return { ...reminderFunnel(events, dryFoodOrders), repeatOrders: repeatOrders(purchases, firstPurchaseAt) };
}
