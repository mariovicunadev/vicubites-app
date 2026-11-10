import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { adminGraphql } from "../admin/graphql.server";
import {
  DECLARED_CUSTOMER_DEFINITIONS,
  missingDefinitions,
  REFILL_CUSTOMER_DEFINITIONS_QUERY,
  type DefinitionShape,
} from "./definitions";

/** Declared Refill Radar customer definitions that the store doesn't have. */
export async function loadMissingDefinitions(graphql: AdminApiContext["graphql"]): Promise<DefinitionShape[]> {
  const { metafieldDefinitions } = await adminGraphql(graphql, REFILL_CUSTOMER_DEFINITIONS_QUERY);
  const found = metafieldDefinitions.nodes.map((node) => ({ key: node.key, type: node.type.name }));
  return missingDefinitions(DECLARED_CUSTOMER_DEFINITIONS, found);
}
