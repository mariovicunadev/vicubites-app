import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { ScrollRegion } from "../components/et/ScrollRegion";
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
        <div className="et-banner" role="alert">
          <strong>The sync could not read Shopify</strong>
          {error}
        </div>
      )}
      <section className="et-section" aria-labelledby="crm-hubspot">
        <h2 id="crm-hubspot" className="et-section__heading">HubSpot</h2>
        <div className="et-panel et-copy et-operation-copy">
          <div className="et-inline">
            <span className={`et-badge et-badge--${connected ? "success" : "caution"}`}>
              {connected ? "HubSpot connected" : "HubSpot not connected"}
            </span>
            {connected && (
              <button
                type="button"
                className="et-button et-button--primary"
                onClick={() => fetcher.submit({}, { method: "post" })}
                disabled={fetcher.state !== "idle"}
                aria-busy={fetcher.state !== "idle"}
              >
                {fetcher.state !== "idle" ? "Syncing…" : "Sync B2B to HubSpot"}
              </button>
            )}
          </div>
          {run && (
            <div className={`et-banner et-banner--${run.failed ? "warning" : "success"}`} role="status">
              Synced {run.companies} companies and {run.contacts} contacts · failed {run.failed}.
            </div>
          )}
          <p>
            {lastSyncedAt
              ? `In HubSpot: ${companies} companies and ${contacts} contacts · last sync ${lastSyncedAt.slice(0, 16).replace("T", " ")} UTC.`
              : "Nothing synced yet."}
          </p>
          <p className="muted">
            {connected
              ? "Companies and their contacts are pushed to HubSpot when they are created or edited in Shopify, and on demand. HubSpot receives the company name, its Shopify ID and each contact's email, nothing else."
              : "Set HUBSPOT_ACCESS_TOKEN (static token of a private HubSpot app with company and contact scopes) in the app's environment to sync B2B companies."}
          </p>
        </div>
      </section>
      {failures.length > 0 && (
        <section className="et-section" aria-labelledby="crm-failures">
          <h2 id="crm-failures" className="et-section__heading">Latest failures</h2>
          <div className="et-panel">
            <ScrollRegion label="CRM sync failures">
              <table className="et-table et-table--operations">
                <thead>
                  <tr>
                    <th scope="col">Record</th>
                    <th scope="col">Error</th>
                    <th scope="col">When (UTC)</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((failure) => (
                    <tr key={`${failure.objectType}-${failure.shopifyId}`}>
                      <td>
                        {failure.objectType === "COMPANY" ? "Company" : "Contact"} {failure.shopifyId.split("/").pop()}
                      </td>
                      <td>{failure.error ?? "—"}</td>
                      <td className="nowrap">{failure.syncedAt.slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        </section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
