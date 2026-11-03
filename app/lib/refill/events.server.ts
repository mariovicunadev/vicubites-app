import prisma from "../../db.server";
import { FUNNEL_DAYS, orderNumber, reminderFunnel, type PixelEvent, type ReminderFunnel } from "./events";

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

export async function loadReminderFunnel(shop: string, now = new Date()): Promise<ReminderFunnel> {
  const since = new Date(now.getTime() - FUNNEL_DAYS * DAY_MS);
  const [events, purchases] = await Promise.all([
    prisma.refillEvent.findMany({
      where: { shop, createdAt: { gte: since } },
      select: { name: true, clientId: true, orderId: true, createdAt: true },
    }),
    prisma.refillPurchase.findMany({ where: { shop, processedAt: { gte: since } }, select: { orderId: true } }),
  ]);
  const dryFoodOrders = new Set(
    purchases.map((purchase) => orderNumber(purchase.orderId)).filter((id): id is string => id !== null),
  );
  return reminderFunnel(events, dryFoodOrders);
}
