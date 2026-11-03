import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { adminGraphql } from "../admin/graphql.server";
import { AdminApiError, assertNoUserErrors } from "../admin/errors";

type AdminGraphql = AdminApiContext["graphql"];

/** The pixel has no settings: it finds the app proxy on the shop's own domain. */
const PIXEL_SETTINGS = "{}";

const REFILL_PIXEL_QUERY = `#graphql
  query refillPixel {
    webPixel {
      id
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

/** The app's web pixel on this shop, or null when it isn't connected yet. */
export async function findRefillPixel(graphql: AdminGraphql): Promise<string | null> {
  try {
    const { webPixel } = await adminGraphql(graphql, REFILL_PIXEL_QUERY);
    return webPixel?.id ?? null;
  } catch (error) {
    // Without a pixel the query answers with a "not found" error rather than null.
    if (error instanceof AdminApiError && error.kind === "graphql" && /not.?found|no web pixel/i.test(error.message)) {
      return null;
    }
    throw error;
  }
}

/** Creates the pixel record, or refreshes it when it exists; both are idempotent. */
export async function connectRefillPixel(graphql: AdminGraphql): Promise<string> {
  const id = await findRefillPixel(graphql);
  if (id) {
    const { webPixelUpdate } = await adminGraphql(graphql, REFILL_PIXEL_UPDATE, {
      variables: { id, settings: PIXEL_SETTINGS },
    });
    assertNoUserErrors("webPixelUpdate", webPixelUpdate?.userErrors);
    return id;
  }
  const { webPixelCreate } = await adminGraphql(graphql, REFILL_PIXEL_CREATE, {
    variables: { settings: PIXEL_SETTINGS },
  });
  assertNoUserErrors("webPixelCreate", webPixelCreate?.userErrors);
  if (!webPixelCreate?.webPixel) throw new AdminApiError("empty-response", "webPixelCreate", []);
  return webPixelCreate.webPixel.id;
}
