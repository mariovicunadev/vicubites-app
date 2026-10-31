import type {
  AdminOperations,
  ApiClientRequestOptions,
  ReturnData,
} from "@shopify/admin-api-client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { AdminApiError, toAdminApiError } from "./errors";

type AdminGraphql = AdminApiContext["graphql"];
type Operation = keyof AdminOperations & string;

interface QueryOptions<Op extends Operation> {
  variables?: ApiClientRequestOptions<Op, AdminOperations>["variables"];
  /** Total attempts, including the first one (retries on network errors and 429). */
  tries?: number;
}

/**
 * Runs a typed Admin GraphQL operation and returns its `data`.
 *
 * The operation string must carry the `#graphql` tag so codegen can generate
 * its result and variables types. Failures are thrown as `AdminApiError`;
 * mutations still check their own payload with `assertNoUserErrors`.
 */
export async function adminGraphql<Op extends Operation>(
  graphql: AdminGraphql,
  operation: Op,
  options?: QueryOptions<Op>,
): Promise<ReturnData<Op, AdminOperations>> {
  const name = operationName(operation);
  try {
    const response = await graphql(operation, options);
    const { data } = await response.json();
    if (!data) {
      throw new AdminApiError("empty-response", name, []);
    }
    return data;
  } catch (error) {
    throw toAdminApiError(name, error);
  }
}

/** `query shopOverview { ... }` → `shopOverview`, for error messages and logs. */
export function operationName(operation: string): string {
  return /\b(?:query|mutation)\s+(\w+)/.exec(operation)?.[1] ?? "anonymous";
}
