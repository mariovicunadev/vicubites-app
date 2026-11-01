import type { LoaderFunctionArgs } from "react-router";

import { AdminApiError } from "../lib/admin/errors";
import { productGid } from "../lib/health/live";
import { checkProduct, saveLiveResult } from "../lib/health/live.server";
import { toHealthRow } from "../lib/health/view";
import { authenticate } from "../shopify.server";

/**
 * Live score for the product block (admin UI extension). The admin sends an
 * ID token with the extension's `fetch`; `authenticate.admin` verifies it and
 * answers the CORS preflight. Every response goes through `cors()`.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);

  const productId = productGid(params.productId ?? "");
  if (!productId) {
    return cors(Response.json({ error: "Not a product ID" }, { status: 400 }));
  }

  try {
    const result = await checkProduct(admin.graphql, productId);
    if (!result) {
      return cors(Response.json({ error: "Product not found" }, { status: 404 }));
    }
    await saveLiveResult(session.shop, result);
    return cors(Response.json({ ...toHealthRow(result), checkedAt: new Date().toISOString() }));
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    return cors(Response.json({ error: error.message }, { status: 502 }));
  }
};
