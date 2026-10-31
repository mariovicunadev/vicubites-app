import type { ActionFunctionArgs } from "react-router";

import { applySnapshot } from "../lib/bulk/jobs.server";
import { getBulkOperation } from "../lib/bulk/operations.server";
import { parseWebhookErrorCode, parseWebhookStatus } from "../lib/bulk/status";
import { authenticate } from "../shopify.server";

interface BulkOperationFinishPayload {
  admin_graphql_api_id: string;
  status: string;
  error_code: string | null;
  completed_at: string | null;
}

/**
 * `bulk_operations/finish`: records the final status, then reads the counts
 * and result URL from GraphQL, since the payload carries neither. Always
 * answers 200 so Shopify doesn't retry deliveries for operations this app
 * doesn't track; the exports page refreshes anything left incomplete.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);
  const event = payload as BulkOperationFinishPayload;
  const operationId = event.admin_graphql_api_id;
  const status = parseWebhookStatus(event.status);

  if (!status) {
    console.warn(`${topic} for ${shop} with unknown status "${event.status}"`);
    return new Response();
  }

  await applySnapshot(operationId, {
    status,
    errorCode: parseWebhookErrorCode(event.error_code),
    completedAt: event.completed_at,
  });

  if (admin) {
    try {
      const operation = await getBulkOperation(admin.graphql, operationId);
      if (operation) await applySnapshot(operationId, operation);
    } catch (error) {
      console.warn(`${topic}: could not read ${operationId}`, error);
    }
  }

  return new Response();
};
