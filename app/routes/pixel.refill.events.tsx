import type { ActionFunctionArgs } from "react-router";

import { MAX_PIXEL_BODY_BYTES, parsePixelEvent } from "../lib/refill/events";
import { isInstalledShop, recordPixelEvent } from "../lib/refill/events.server";

/**
 * Receives the Refill Radar web pixel's posts. The pixel runs in a sandbox
 * with an opaque origin and no cookies, so it can't go through the app proxy
 * of a password-protected storefront; it posts here directly. The body is
 * untrusted: it is validated, its shop must have the app installed, and the
 * funnel only counts orders the app already knows from its webhook.
 */
const CORS = { "Access-Control-Allow-Origin": "*" };

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: CORS });

  const body = await request.text();
  if (body.length > MAX_PIXEL_BODY_BYTES) return new Response(null, { status: 413, headers: CORS });
  const event = parsePixelEvent(body);
  if (!event || !(await isInstalledShop(event.shop))) return new Response(null, { status: 400, headers: CORS });

  await recordPixelEvent(event);
  return new Response(null, { status: 204, headers: CORS });
};

export const loader = () => new Response(null, { status: 405, headers: CORS });
