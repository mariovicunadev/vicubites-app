import type { ActionFunctionArgs } from "react-router";

import { recordPreference } from "../lib/refill/preference.server";
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
 * upserted and the forecast is recomputed from the same rows. The buyer's
 * reminder choice from checkout is stored before reminders run, so turning
 * them off takes effect on this very order.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);
  if (!admin) {
    // No offline session for the shop (fresh database or uninstalled app): nothing can be read.
    console.warn(`${topic} for ${shop}: no offline session, webhook skipped`);
    return new Response();
  }

  const orderId = (payload as OrderCreatePayload).admin_graphql_api_id;
  const order = await fetchOrder(admin.graphql, orderId);
  if (!order?.customerId) return new Response();

  if (await recordPreference(admin.graphql, shop, order)) {
    console.info(`${topic} ${orderId}: refill reminders ${order.refillReminders ? "on" : "off"} for ${order.customerId}`);
  }

  const purchases = await recordOrder(shop, order);
  if (purchases.length > 0) {
    const forecasts = await refreshCustomer(admin.graphql, shop, order.customerId);
    console.info(`${topic} ${orderId}: ${forecasts.length} forecast(s) for ${order.customerId}`);
    // Reminders are best effort: a Klaviyo or Flow outage must not fail the webhook (Shopify would retry it).
    try {
      const runs = await sendDueReminders(admin.graphql, shop, { customerId: order.customerId });
      for (const [channel, run] of Object.entries(runs)) {
        if (run && run.sent + run.failed > 0) console.info(`${topic} ${orderId}: ${channel} reminders sent ${run.sent}, failed ${run.failed}`);
      }
    } catch (error) {
      console.error(`${topic} ${orderId}: reminders not sent`, error instanceof Error ? error.message : error);
    }
  }
  return new Response();
};
