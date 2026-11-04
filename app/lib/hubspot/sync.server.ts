import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { HubspotCompaniesQuery } from "../../types/admin.generated";
import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { HUBSPOT_API_VERSION, hubspotRequest, hubspotToken, type HubSpotClientOptions } from "./client.server";
import {
  associationInputs,
  chunks,
  COMPANY_ID_PROPERTY,
  companyUpsertInput,
  contactUpsertInputs,
  normalizeEmail,
  shopifyNumericId,
  toB2BCompany,
  type B2BCompany,
  type UpsertInput,
} from "./mappers";

type AdminGraphql = AdminApiContext["graphql"];

const HUBSPOT_COMPANIES = `#graphql
  query hubspotCompanies($after: String) {
    companies(first: 50, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        id
        name
        contacts(first: 50) {
          nodes {
            id
            customer {
              defaultEmailAddress {
                emailAddress
              }
            }
          }
        }
      }
    }
  }
`;

const HUBSPOT_COMPANY = `#graphql
  query hubspotCompany($id: ID!) {
    company(id: $id) {
      id
      name
      contacts(first: 50) {
        nodes {
          id
          customer {
            defaultEmailAddress {
              emailAddress
            }
          }
        }
      }
    }
  }
`;

const HUBSPOT_COMPANY_OF_CONTACT = `#graphql
  query hubspotCompanyOfContact($id: ID!) {
    companyContact(id: $id) {
      company {
        id
      }
    }
  }
`;

export interface CrmSyncRun {
  companies: number;
  contacts: number;
  failed: number;
}

interface UpsertResponse {
  results: { id: string; properties: Record<string, string | null> }[];
}

/** Every B2B company of the shop, read from Shopify. */
export async function readCompanies(graphql: AdminGraphql): Promise<B2BCompany[]> {
  const companies: B2BCompany[] = [];
  let after: string | null = null;
  do {
    const data: HubspotCompaniesQuery = await adminGraphql(graphql, HUBSPOT_COMPANIES, { variables: { after } });
    const page = data.companies;
    companies.push(...page.nodes.map(toB2BCompany));
    after = page.pageInfo.hasNextPage ? (page.pageInfo.endCursor ?? null) : null;
  } while (after);
  return companies;
}

/** One company, read from Shopify; null when it was deleted. */
export async function readCompany(graphql: AdminGraphql, companyId: string): Promise<B2BCompany | null> {
  const { company } = await adminGraphql(graphql, HUBSPOT_COMPANY, { variables: { id: companyId } });
  return company ? toB2BCompany(company) : null;
}

/** The company a contact belongs to (company contact webhooks carry the contact). */
export async function companyOfContact(graphql: AdminGraphql, contactId: string): Promise<string | null> {
  const { companyContact } = await adminGraphql(graphql, HUBSPOT_COMPANY_OF_CONTACT, { variables: { id: contactId } });
  return companyContact?.company.id ?? null;
}

/** Creates the unique `shopify_company_id` company property once per HubSpot account. */
export async function ensureCompanyIdProperty(token: string, options?: HubSpotClientOptions): Promise<void> {
  const path = `/crm/properties/${HUBSPOT_API_VERSION}/companies`;
  const existing = await hubspotRequest(token, "GET", `${path}/${COMPANY_ID_PROPERTY}`, undefined, options);
  if (existing) return;
  await hubspotRequest(
    token,
    "POST",
    path,
    {
      groupName: "companyinformation",
      name: COMPANY_ID_PROPERTY,
      label: "Shopify company ID",
      description: "ID of the B2B company in Shopify. Set by the Vicubites app.",
      type: "string",
      fieldType: "text",
      hasUniqueValue: true,
    },
    options,
  );
}

/** Upserts in batches of 100 and maps each returned record by the given property. */
async function upsert(
  token: string,
  objectType: "companies" | "contacts",
  inputs: readonly UpsertInput[],
  keyProperty: string,
  options?: HubSpotClientOptions,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const batch of chunks(inputs)) {
    const response = await hubspotRequest<UpsertResponse>(
      token,
      "POST",
      `/crm/objects/${HUBSPOT_API_VERSION}/${objectType}/batch/upsert`,
      { inputs: batch },
      options,
    );
    for (const record of response?.results ?? []) {
      const key = record.properties[keyProperty];
      if (key) ids.set(keyProperty === "email" ? normalizeEmail(key) : key, record.id);
    }
  }
  return ids;
}

/**
 * Pushes companies and their contacts to HubSpot: upsert companies by
 * `shopify_company_id`, upsert contacts by email, then associate each contact
 * with its company. Replays are harmless (upserts and default associations
 * are idempotent). Records one row per company and contact. Returns null
 * when HubSpot isn't connected.
 */
export async function syncCompanies(
  shop: string,
  companies: readonly B2BCompany[],
  { now = new Date(), ...options }: HubSpotClientOptions & { now?: Date } = {},
): Promise<CrmSyncRun | null> {
  const token = hubspotToken();
  if (!token) return null;
  const run: CrmSyncRun = { companies: 0, contacts: 0, failed: 0 };
  if (companies.length === 0) return run;

  let companyIds = new Map<string, string>();
  let contactIds = new Map<string, string>();
  let failure: string | null = null;
  try {
    await ensureCompanyIdProperty(token, options);
    companyIds = await upsert(token, "companies", companies.map(companyUpsertInput), COMPANY_ID_PROPERTY, options);
    contactIds = await upsert(token, "contacts", contactUpsertInputs(companies), "email", options);
    for (const batch of chunks(associationInputs(companies, companyIds, contactIds))) {
      await hubspotRequest(
        token,
        "POST",
        `/crm/associations/${HUBSPOT_API_VERSION}/contact/company/batch/associate/default`,
        { inputs: batch },
        options,
      );
    }
  } catch (cause) {
    failure = cause instanceof Error ? cause.message : "HubSpot request failed.";
  }

  for (const company of companies) {
    const hubspotId = companyIds.get(shopifyNumericId(company.id)) ?? null;
    run[await record(shop, "COMPANY", company.id, hubspotId, failure, now)]++;
    for (const contact of company.contacts) {
      const contactId = contactIds.get(normalizeEmail(contact.email)) ?? null;
      run[await record(shop, "CONTACT", contact.id, contactId, failure, now)]++;
    }
  }
  return run;
}

async function record(
  shop: string,
  objectType: "COMPANY" | "CONTACT",
  shopifyId: string,
  hubspotId: string | null,
  failure: string | null,
  now: Date,
): Promise<keyof CrmSyncRun> {
  const synced = hubspotId !== null && failure === null;
  const error = synced ? null : (failure ?? "Not returned by HubSpot.");
  const data = { hubspotId, status: synced ? "SYNCED" : "FAILED", error, syncedAt: now };
  await prisma.crmSyncRecord.upsert({
    where: { shop_objectType_shopifyId: { shop, objectType, shopifyId } },
    create: { shop, objectType, shopifyId, ...data },
    update: data,
  });
  if (!synced) return "failed";
  return objectType === "COMPANY" ? "companies" : "contacts";
}

/** Initial load and manual resync: every company of the shop. */
export async function syncAllCompanies(graphql: AdminGraphql, shop: string): Promise<CrmSyncRun | null> {
  if (!hubspotToken()) return null;
  return syncCompanies(shop, await readCompanies(graphql));
}

/** Webhook path: one company, re-read from Shopify (webhooks notify, they don't inform). */
export async function syncCompany(graphql: AdminGraphql, shop: string, companyId: string): Promise<CrmSyncRun | null> {
  if (!hubspotToken()) return null;
  const company = await readCompany(graphql, companyId);
  return company ? syncCompanies(shop, [company]) : null;
}

export interface CrmSyncStatus {
  connected: boolean;
  lastSyncedAt: string | null;
  companies: number;
  contacts: number;
  failures: { objectType: string; shopifyId: string; error: string | null; syncedAt: string }[];
}

/** Sync summary for the B2B CRM page. */
export async function loadCrmSyncStatus(shop: string): Promise<CrmSyncStatus> {
  const [last, companies, contacts, failures] = await Promise.all([
    prisma.crmSyncRecord.findFirst({ where: { shop }, orderBy: { syncedAt: "desc" }, select: { syncedAt: true } }),
    prisma.crmSyncRecord.count({ where: { shop, objectType: "COMPANY", status: "SYNCED" } }),
    prisma.crmSyncRecord.count({ where: { shop, objectType: "CONTACT", status: "SYNCED" } }),
    prisma.crmSyncRecord.findMany({
      where: { shop, status: "FAILED" },
      orderBy: { syncedAt: "desc" },
      take: 10,
      select: { objectType: true, shopifyId: true, error: true, syncedAt: true },
    }),
  ]);
  return {
    connected: hubspotToken() !== null,
    lastSyncedAt: last?.syncedAt.toISOString() ?? null,
    companies,
    contacts,
    failures: failures.map((f) => ({ ...f, syncedAt: f.syncedAt.toISOString() })),
  };
}
