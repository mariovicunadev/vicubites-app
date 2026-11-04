import type { ActionFunctionArgs } from "react-router";

import { sendDueReminders } from "../lib/refill/reminders.server";
import { fetchOrder, recordOrder, refreshCustomer } from "../lib/refill/store.server";
import { authenticate } from "../shopify.server";

interface OrderCreatePayload {
  admin_graphql_api_id: string;
}

/**
 * `orders/create`: reads the order through GraphQL (the same fields as the
 * bulk load, instead of the REST-shaped payload), stores its dry food and
 * recomputes that customer's forecast. Replays are harmless: purchases are
 * upserted and the forecast is recomputed from the same rows.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);
  if (!admin) return new Response();

  const orderId = (payload as OrderCreatePayload).admin_graphql_api_id;
  const order = await fetchOrder(admin.graphql, orderId);
  if (!order?.customerId) return new Response();

  const purchases = await recordOrder(shop, order);
  if (purchases.length > 0) {
    const forecasts = await refreshCustomer(admin.graphql, shop, order.customerId);
    console.info(`${topic} ${orderId}: ${forecasts.length} forecast(s) for ${order.customerId}`);
    // Reminders are best effort: a Klaviyo outage must not fail the webhook (Shopify would retry it).
    try {
      const run = await sendDueReminders(admin.graphql, shop, { customerId: order.customerId });
      if (run.sent + run.failed > 0) console.info(`${topic} ${orderId}: reminders sent ${run.sent}, failed ${run.failed}`);
    } catch (error) {
      console.error(`${topic} ${orderId}: reminders not sent`, error instanceof Error ? error.message : error);
    }
  }
  return new Response();
};
