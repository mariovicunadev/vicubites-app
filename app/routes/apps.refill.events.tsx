import type { ActionFunctionArgs } from "react-router";

import { MAX_PIXEL_BODY_BYTES, parsePixelEvent } from "../lib/refill/events";
import { recordPixelEvent } from "../lib/refill/events.server";
import { authenticate } from "../shopify.server";

/**
 * Receives the Refill Radar web pixel's posts through the app proxy
 * (`/apps/vicubites-refill/events` on the shop). Shopify signs proxied
 * requests, so an unsigned post is rejected and the shop is known.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const { session } = await authenticate.public.appProxy(request);
  if (!session) return new Response(null, { status: 401 });

  const body = await request.text();
  if (body.length > MAX_PIXEL_BODY_BYTES) return new Response(null, { status: 413 });
  const event = parsePixelEvent(body);
  if (!event) return new Response(null, { status: 400 });

  await recordPixelEvent(session.shop, event);
  return new Response(null, { status: 204 });
};

export const loader = () => new Response(null, { status: 405 });
