import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { adminGraphql } from "../admin/graphql.server";
import { AdminApiError, assertNoUserErrors } from "../admin/errors";

type AdminGraphql = AdminApiContext["graphql"];

/** The `pixel.refill.events` route. */
const PIXEL_ENDPOINT_PATH = "/pixel/refill/events";

/** The pixel's only setting: the app's endpoint URL, which changes with the app's host. */
export function pixelSettings(appUrl: string) {
  return JSON.stringify({ endpoint: new URL(PIXEL_ENDPOINT_PATH, appUrl).toString() });
}

const REFILL_PIXEL_QUERY = `#graphql
  query refillPixel {
    webPixel {
      id
      settings
    }
  }
`;

const REFILL_PIXEL_CREATE = `#graphql
  mutation refillPixelCreate($settings: JSON!) {
    webPixelCreate(webPixel: { settings: $settings }) {
      webPixel {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

const REFILL_PIXEL_UPDATE = `#graphql
  mutation refillPixelUpdate($id: ID!, $settings: JSON!) {
    webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
      webPixel {
        id
      }
      userErrors {
        code
        field
        message
      }
    }
  }
`;

interface RefillPixel {
  id: string;
  /** The settings JSON as Shopify stores it. */
  settings: string;
}

/** The app's web pixel on this shop, or null when it isn't connected yet. */
export async function findRefillPixel(graphql: AdminGraphql): Promise<RefillPixel | null> {
  try {
    const { webPixel } = await adminGraphql(graphql, REFILL_PIXEL_QUERY);
    if (!webPixel) return null;
    const settings: unknown = webPixel.settings;
    return { id: webPixel.id, settings: typeof settings === "string" ? settings : JSON.stringify(settings) };
  } catch (error) {
    // Without a pixel the query answers with a "not found" error rather than null.
    if (error instanceof AdminApiError && error.kind === "graphql" && /not.?found|no web pixel/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

/** Points an existing pixel at the app's current URL; does nothing when it already does. */
export async function syncRefillPixel(graphql: AdminGraphql, pixel: RefillPixel, appUrl: string) {
  const settings = pixelSettings(appUrl);
  if (pixel.settings === settings) return;
  const { webPixelUpdate } = await adminGraphql(graphql, REFILL_PIXEL_UPDATE, {
    variables: { id: pixel.id, settings },
  });
  assertNoUserErrors("webPixelUpdate", webPixelUpdate?.userErrors);
}

/** Creates the pixel record, or points the existing one at the app's current URL. */
export async function connectRefillPixel(graphql: AdminGraphql, appUrl: string): Promise<string> {
  const pixel = await findRefillPixel(graphql);
  if (pixel) {
    await syncRefillPixel(graphql, pixel, appUrl);
    return pixel.id;
  }
  const { webPixelCreate } = await adminGraphql(graphql, REFILL_PIXEL_CREATE, {
    variables: { settings: pixelSettings(appUrl) },
  });
  assertNoUserErrors("webPixelCreate", webPixelCreate?.userErrors);
  if (!webPixelCreate?.webPixel) throw new AdminApiError("empty-response", "webPixelCreate", []);
  return webPixelCreate.webPixel.id;
}
