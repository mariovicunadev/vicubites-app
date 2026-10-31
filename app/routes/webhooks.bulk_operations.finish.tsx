import type { ActionFunctionArgs } from "react-router";

import { applySnapshot } from "../lib/bulk/jobs.server";
import { parseWebhookErrorCode, parseWebhookStatus } from "../lib/bulk/status";
import { authenticate } from "../shopify.server";

interface BulkOperationFinishPayload {
  admin_graphql_api_id: string;
  status: string;
  error_code: string | null;
  completed_at: string | null;
}

/**
 * `bulk_operations/finish`: marks the job as finished as soon as Shopify
 * reports it. The payload has no counts or URL; the exports page reads those
 * from GraphQL when it needs them. Responds fast and always with 200, so
 * Shopify doesn't retry deliveries for operations this app doesn't track.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);
  const event = payload as BulkOperationFinishPayload;
  const status = parseWebhookStatus(event.status);

  if (status) {
    await applySnapshot(event.admin_graphql_api_id, {
      status,
      errorCode: parseWebhookErrorCode(event.error_code),
      completedAt: event.completed_at,
    });
  } else {
    console.warn(`${topic} for ${shop} with unknown status "${event.status}"`);
  }

  return new Response();
};
