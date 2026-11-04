import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { loadCrmSyncStatus, syncAllCompanies } from "../lib/hubspot/sync.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return loadCrmSyncStatus(session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    return { error: null, run: await syncAllCompanies(admin.graphql, session.shop) };
  } catch (error) {
    if (error instanceof AdminApiError) return { error: error.message, run: null };
    throw error;
  }
};

export default function B2BCrm() {
  const { connected, lastSyncedAt, companies, contacts, failures } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const run = fetcher.data?.run ?? null;
  const error = fetcher.data?.error ?? null;

  return (
    <s-page heading="B2B CRM">
      {error && (
        <s-banner heading="The sync could not read Shopify" tone="critical">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      )}
      <s-section heading="HubSpot">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small-200">
            <s-badge tone={connected ? "success" : "warning"}>
              {connected ? "HubSpot connected" : "HubSpot not connected"}
            </s-badge>
            {connected && (
              <s-button
                onClick={() => fetcher.submit({}, { method: "post" })}
                {...(fetcher.state !== "idle" ? { disabled: true } : {})}
              >
                Sync B2B to HubSpot
              </s-button>
            )}
          </s-stack>
          {run && (
            <s-paragraph>
              Synced {run.companies} companies and {run.contacts} contacts · failed {run.failed}.
            </s-paragraph>
          )}
          <s-paragraph>
            {lastSyncedAt
              ? `In HubSpot: ${companies} companies and ${contacts} contacts · last sync ${lastSyncedAt.slice(0, 16).replace("T", " ")} UTC.`
              : "Nothing synced yet."}
          </s-paragraph>
          <s-text color="subdued">
            {connected
              ? "Companies and their contacts are pushed to HubSpot when they are created or edited in Shopify, and on demand. HubSpot receives the company name, its Shopify ID and each contact's email, nothing else."
              : "Set HUBSPOT_ACCESS_TOKEN (static token of a private HubSpot app with company and contact scopes) in the app's environment to sync B2B companies."}
          </s-text>
        </s-stack>
      </s-section>
      {failures.length > 0 && (
        <s-section heading="Latest failures">
          <s-table>
            <s-table-header-row>
              <s-table-header>Record</s-table-header>
              <s-table-header>Error</s-table-header>
              <s-table-header>When (UTC)</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {failures.map((failure) => (
                <s-table-row key={`${failure.objectType}-${failure.shopifyId}`}>
                  <s-table-cell>
                    {failure.objectType === "COMPANY" ? "Company" : "Contact"} {failure.shopifyId.split("/").pop()}
                  </s-table-cell>
                  <s-table-cell>{failure.error ?? "—"}</s-table-cell>
                  <s-table-cell>{failure.syncedAt.slice(0, 16).replace("T", " ")}</s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
