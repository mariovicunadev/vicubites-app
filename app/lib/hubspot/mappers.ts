/** Unique company property that links a HubSpot company to its Shopify company. */
export const COMPANY_ID_PROPERTY = "shopify_company_id";

/** HubSpot batch endpoints take up to 100 inputs. */
export const HUBSPOT_BATCH_SIZE = 100;

/** A Shopify B2B company with only the fields that reach HubSpot (D-033: name, ID, contact emails). */
export interface B2BCompany {
  /** Company GID. */
  id: string;
  name: string;
  contacts: B2BContact[];
}

export interface B2BContact {
  /** CompanyContact GID: kept in the app instead of the email. */
  id: string;
  /** Read from Shopify at sync time; never stored by the app. */
  email: string;
}

export interface UpsertInput {
  idProperty: string;
  id: string;
  properties: Record<string, string>;
}

/** Numeric part of a Shopify GID, as HubSpot stores it. */
export function shopifyNumericId(gid: string): string {
  const match = /(\d+)$/.exec(gid);
  if (!match) throw new Error(`Not a Shopify ID: ${gid}`);
  return match[1];
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function companyUpsertInput(company: B2BCompany): UpsertInput {
  const id = shopifyNumericId(company.id);
  return { idProperty: COMPANY_ID_PROPERTY, id, properties: { name: company.name, [COMPANY_ID_PROPERTY]: id } };
}

/**
 * One input per distinct email across the companies: the same person can be
 * a contact of two companies, and HubSpot rejects a batch with duplicate IDs.
 * Email is the only property sent, as upserts by email can't be partial.
 */
export function contactUpsertInputs(companies: readonly B2BCompany[]): UpsertInput[] {
  const emails = new Set(companies.flatMap((company) => company.contacts.map((contact) => normalizeEmail(contact.email))));
  return [...emails].map((email) => ({ idProperty: "email", id: email, properties: { email } }));
}

export interface AssociationInput {
  from: { id: string };
  to: { id: string };
}

/** Contact → company pairs, from the HubSpot IDs returned by the upserts. */
export function associationInputs(
  companies: readonly B2BCompany[],
  companyIds: ReadonlyMap<string, string>,
  contactIds: ReadonlyMap<string, string>,
): AssociationInput[] {
  const inputs: AssociationInput[] = [];
  for (const company of companies) {
    const companyId = companyIds.get(shopifyNumericId(company.id));
    if (!companyId) continue;
    for (const contact of company.contacts) {
      const contactId = contactIds.get(normalizeEmail(contact.email));
      if (contactId) inputs.push({ from: { id: contactId }, to: { id: companyId } });
    }
  }
  return inputs;
}

export function chunks<T>(items: readonly T[], size = HUBSPOT_BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let start = 0; start < items.length; start += size) out.push(items.slice(start, start + size));
  return out;
}

/** The GraphQL company node, before its contacts are filtered to those with an email. */
export interface CompanyNode {
  id: string;
  name: string;
  contacts: { nodes: { id: string; customer: { defaultEmailAddress?: { emailAddress?: string | null } | null } }[] };
}

export function toB2BCompany(node: CompanyNode): B2BCompany {
  const contacts: B2BContact[] = [];
  for (const contact of node.contacts.nodes) {
    const email = contact.customer.defaultEmailAddress?.emailAddress;
    if (email) contacts.push({ id: contact.id, email });
  }
  return { id: node.id, name: node.name, contacts };
}
