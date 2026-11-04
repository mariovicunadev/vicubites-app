import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { assertNoUserErrors } from "../admin/errors";
import { adminGraphql } from "../admin/graphql.server";
import { REFILL_DUE_TRIGGER, refillDuePayload, type RefillDueTrigger } from "./refill-due";

type AdminGraphql = AdminApiContext["graphql"];

const FLOW_TRIGGER_RECEIVE = `#graphql
  mutation flowTriggerRefillDue($handle: String!, $payload: JSON!) {
    flowTriggerReceive(handle: $handle, payload: $payload) {
      userErrors {
        field
        message
      }
    }
  }
`;

/** Starts every enabled workflow of the shop that begins with the Refill due trigger. */
export async function fireRefillDue(graphql: AdminGraphql, trigger: RefillDueTrigger): Promise<void> {
  const { flowTriggerReceive } = await adminGraphql(graphql, FLOW_TRIGGER_RECEIVE, {
    variables: { handle: REFILL_DUE_TRIGGER, payload: refillDuePayload(trigger) },
  });
  assertNoUserErrors("flowTriggerRefillDue", flowTriggerReceive?.userErrors);
}
