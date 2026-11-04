import { speciesFrom, type Species } from "./forecast";

/** Events the web pixel forwards. The first two are published by the storefront block. */
export const PIXEL_EVENT_NAMES = ["reminder_viewed", "reminder_clicked", "checkout_completed"] as const;
export type PixelEventName = (typeof PIXEL_EVENT_NAMES)[number];

/** Days left until run-out, bucketed by the storefront block so no date leaves the page. */
export const DAYS_LEFT_BUCKETS = ["overdue", "0-7", "8-14", "15+"] as const;
export type DaysLeftBucket = (typeof DAYS_LEFT_BUCKETS)[number];

/** The reminder card covers this window. */
export const FUNNEL_DAYS = 30;

/** Pixel payloads are a few short strings; anything bigger is rejected unread. */
export const MAX_PIXEL_BODY_BYTES = 1024;

export interface PixelEvent {
  /** The shop's myshopify domain, from the pixel's init data; checked against installed shops. */
  shop: string;
  name: PixelEventName;
  clientId: string;
  species: Species | null;
  bucket: DaysLeftBucket | null;
  /** Numeric order ID, on `checkout_completed` only. */
  orderId: string | null;
}

const CLIENT_ID = /^[\w-]{1,64}$/;
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

/** The numeric part of an order ID, whether it comes as a GID or as digits. */
export function orderNumber(id: unknown): string | null {
  if (typeof id !== "string" && typeof id !== "number") return null;
  const match = /(\d+)$/.exec(String(id));
  return match ? match[1] : null;
}

/**
 * Validates a pixel post. Custom events can be published from the browser
 * console, so the body is untrusted: only known names and short values pass.
 */
export function parsePixelEvent(body: string): PixelEvent | null {
  if (body.length > MAX_PIXEL_BODY_BYTES) return null;
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const fields = data as Record<string, unknown>;
  if (typeof fields.shop !== "string" || !SHOP_DOMAIN.test(fields.shop)) return null;
  if (!isOneOf(PIXEL_EVENT_NAMES, fields.name)) return null;
  if (typeof fields.clientId !== "string" || !CLIENT_ID.test(fields.clientId)) return null;

  if (fields.name === "checkout_completed") {
    const orderId = orderNumber(fields.orderId);
    if (!orderId) return null;
    return { shop: fields.shop, name: fields.name, clientId: fields.clientId, species: null, bucket: null, orderId };
  }
  const species = typeof fields.species === "string" ? speciesFrom(fields.species) : null;
  if (!species) return null;
  return {
    shop: fields.shop,
    name: fields.name,
    clientId: fields.clientId,
    species,
    bucket: isOneOf(DAYS_LEFT_BUCKETS, fields.bucket) ? fields.bucket : null,
    orderId: null,
  };
}

export interface StoredEvent {
  name: string;
  clientId: string;
  orderId: string | null;
  createdAt: Date;
}

export interface WindowPurchase {
  customerId: string;
  orderId: string;
  processedAt: Date;
}

/**
 * Dry food reorders measured on the server: orders from customers who had
 * bought dry food before (so they had a forecast). Order webhooks see every
 * order, so this includes visitors whose browser blocks the pixel.
 */
export function repeatOrders(purchases: readonly WindowPurchase[], firstPurchaseAt: ReadonlyMap<string, Date>): number {
  const orders = new Set<string>();
  for (const purchase of purchases) {
    const first = firstPurchaseAt.get(purchase.customerId);
    if (first && first.getTime() < purchase.processedAt.getTime()) orders.add(purchase.orderId);
  }
  return orders.size;
}

export interface ReminderFunnel {
  /** Browsers that saw at least one reminder. */
  viewed: number;
  /** Browsers that clicked Reorder. */
  clicked: number;
  /** Dry food orders checked out by a browser that had seen a reminder before. */
  reorders: number;
}

/**
 * Counts the reminder funnel. Only orders the app recorded as dry food
 * purchases count as reorders, so a forged checkout event adds nothing.
 */
export function reminderFunnel(events: readonly StoredEvent[], dryFoodOrders: ReadonlySet<string>): ReminderFunnel {
  const firstView = new Map<string, number>();
  const clicked = new Set<string>();
  const reorders = new Set<string>();
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  for (const event of sorted) {
    const time = event.createdAt.getTime();
    if (event.name === "reminder_viewed" && !firstView.has(event.clientId)) firstView.set(event.clientId, time);
    if (event.name === "reminder_clicked") clicked.add(event.clientId);
    if (event.name === "checkout_completed" && event.orderId && dryFoodOrders.has(event.orderId)) {
      const viewedAt = firstView.get(event.clientId);
      if (viewedAt !== undefined && viewedAt <= time) reorders.add(event.orderId);
    }
  }
  return { viewed: firstView.size, clicked: clicked.size, reorders: reorders.size };
}
