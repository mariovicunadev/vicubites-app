import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { adminGraphql } from "../admin/graphql.server";

type AdminGraphql = AdminApiContext["graphql"];

/** `publication` needs `read_publications`; the catalogs themselves only `read_products`. */
const B2B_CATALOGS_QUERY = `#graphql
  query b2bCatalogs {
    catalogs(first: 50, type: COMPANY_LOCATION) {
      nodes {
        id
        status
        publication {
          id
        }
      }
    }
  }
` as const;

interface CatalogNode {
  status: string;
  publication?: { id: string } | null;
}

/**
 * Publications of the active B2B catalogs. A catalog without a publication
 * leaves availability to the sales channel, so there's nothing to check.
 */
export function activePublicationIds(catalogs: readonly CatalogNode[]): string[] {
  const ids = catalogs
    .filter((catalog) => catalog.status === "ACTIVE")
    .flatMap((catalog) => (catalog.publication ? [catalog.publication.id] : []));
  return [...new Set(ids)];
}

export async function loadB2bPublicationIds(graphql: AdminGraphql): Promise<string[]> {
  const data = await adminGraphql(graphql, B2B_CATALOGS_QUERY);
  return activePublicationIds(data.catalogs.nodes);
}
