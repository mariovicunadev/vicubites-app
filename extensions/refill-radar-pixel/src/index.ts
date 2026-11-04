import { register } from "@shopify/web-pixels-extension";

/** Custom events published by the Refill reminder block. */
const REMINDER_EVENTS = ["reminder_viewed", "reminder_clicked"] as const;

register(({ analytics, init, settings }) => {
  // The app keeps its endpoint URL in the pixel settings; the shop domain tells it whose event this is.
  const endpoint = String(settings.endpoint);
  const shop = init.data.shop.myshopifyDomain;

  // A plain-text body keeps the request simple (no CORS preflight); no customer data is sent.
  const send = (payload: Record<string, unknown>) => {
    fetch(endpoint, { method: "POST", body: JSON.stringify({ shop, ...payload }), keepalive: true }).catch(() => {});
  };

  for (const name of REMINDER_EVENTS) {
    analytics.subscribe(`vicubites_refill:${name}`, (event) => {
      const data = (event.customData ?? {}) as { species?: unknown; bucket?: unknown };
      send({ name, clientId: event.clientId, species: data.species, bucket: data.bucket });
    });
  }

  analytics.subscribe("checkout_completed", (event) => {
    send({ name: "checkout_completed", clientId: event.clientId, orderId: event.data.checkout.order?.id });
  });
});
