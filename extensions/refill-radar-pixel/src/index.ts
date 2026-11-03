import { register } from "@shopify/web-pixels-extension";

/** Custom events published by the Refill reminder block. */
const REMINDER_EVENTS = ["reminder_viewed", "reminder_clicked"] as const;

register(({ analytics, init, settings }) => {
  // The app sets the app proxy path when it connects the pixel; requests stay on the shop's domain.
  const origin = init.data.shop.storefrontUrl ?? `https://${init.data.shop.myshopifyDomain}`;
  const endpoint = new URL(String(settings.endpoint_path), origin).toString();

  // A plain-text body keeps the request simple (no CORS preflight); no customer data is sent.
  const send = (payload: Record<string, unknown>) => {
    fetch(endpoint, { method: "POST", body: JSON.stringify(payload), keepalive: true }).catch(() => {});
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
