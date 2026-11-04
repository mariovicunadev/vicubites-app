import type { ActionFunctionArgs } from "react-router";

import { companyOfContact, syncCompany } from "../lib/hubspot/sync.server";
import { authenticate } from "../shopify.server";

interface CompanyWebhookPayload {
  admin_graphql_api_id: string;
}

/**
 * `companies/create`, `companies/update`, `company_contacts/create` and
 * `company_contacts/update`: re-reads the company through GraphQL and pushes
 * it with its contacts to HubSpot. Best effort: a HubSpot outage is recorded
 * on the B2B CRM page (and fixed by a manual sync), not retried by Shopify.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, payload, shop, topic } = await authenticate.webhook(request);
  if (!admin) return new Response();

  const objectId = (payload as CompanyWebhookPayload).admin_graphql_api_id;
  try {
    const isContact = topic.toUpperCase().replace("/", "_").startsWith("COMPANY_CONTACTS");
    const companyId = isContact ? await companyOfContact(admin.graphql, objectId) : objectId;
    if (!companyId) return new Response();
    const run = await syncCompany(admin.graphql, shop, companyId);
    if (run) console.info(`${topic} ${objectId}: HubSpot companies ${run.companies}, contacts ${run.contacts}, failed ${run.failed}`);
  } catch (error) {
    console.error(`${topic} ${objectId}: HubSpot sync failed`, error instanceof Error ? error.message : error);
  }
  return new Response();
};
