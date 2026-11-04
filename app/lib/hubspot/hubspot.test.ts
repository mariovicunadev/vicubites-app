import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HubSpotError, hubspotRequest } from "./client.server";
import {
  associationInputs,
  chunks,
  COMPANY_ID_PROPERTY,
  companyUpsertInput,
  contactUpsertInputs,
  toB2BCompany,
  type B2BCompany,
} from "./mappers";
import { ensureCompanyIdProperty } from "./sync.server";

const clinic: B2BCompany = {
  id: "gid://shopify/Company/101",
  name: "Northside Vet Clinic",
  contacts: [
    { id: "gid://shopify/CompanyContact/1", email: "Ana@Example.com" },
    { id: "gid://shopify/CompanyContact/2", email: "ben@example.com" },
  ],
};
const shop: B2BCompany = {
  id: "gid://shopify/Company/102",
  name: "Paws Pet Shop",
  contacts: [{ id: "gid://shopify/CompanyContact/3", email: "ana@example.com " }],
};

describe("companyUpsertInput", () => {
  it("upserts by shopify_company_id with only the name and the ID", () => {
    expect(companyUpsertInput(clinic)).toEqual({
      idProperty: COMPANY_ID_PROPERTY,
      id: "101",
      properties: { name: "Northside Vet Clinic", [COMPANY_ID_PROPERTY]: "101" },
    });
  });
});

describe("contactUpsertInputs", () => {
  it("sends one input per distinct email, with the email as the only property", () => {
    expect(contactUpsertInputs([clinic, shop])).toEqual([
      { idProperty: "email", id: "ana@example.com", properties: { email: "ana@example.com" } },
      { idProperty: "email", id: "ben@example.com", properties: { email: "ben@example.com" } },
    ]);
  });
});

describe("associationInputs", () => {
  it("pairs each contact with its company from the HubSpot IDs", () => {
    const companyIds = new Map([
      ["101", "c-1"],
      ["102", "c-2"],
    ]);
    const contactIds = new Map([
      ["ana@example.com", "p-1"],
      ["ben@example.com", "p-2"],
    ]);
    expect(associationInputs([clinic, shop], companyIds, contactIds)).toEqual([
      { from: { id: "p-1" }, to: { id: "c-1" } },
      { from: { id: "p-2" }, to: { id: "c-1" } },
      { from: { id: "p-1" }, to: { id: "c-2" } },
    ]);
  });

  it("skips records HubSpot didn't return", () => {
    expect(associationInputs([clinic], new Map(), new Map([["ana@example.com", "p-1"]]))).toEqual([]);
  });
});

describe("toB2BCompany", () => {
  it("keeps contacts with an email and drops the rest", () => {
    const company = toB2BCompany({
      id: "gid://shopify/Company/1",
      name: "Groom Room",
      contacts: {
        nodes: [
          { id: "gid://shopify/CompanyContact/1", customer: { defaultEmailAddress: { emailAddress: "a@example.com" } } },
          { id: "gid://shopify/CompanyContact/2", customer: { defaultEmailAddress: null } },
        ],
      },
    });
    expect(company.contacts).toEqual([{ id: "gid://shopify/CompanyContact/1", email: "a@example.com" }]);
  });
});

describe("chunks", () => {
  it("splits inputs into HubSpot batches of 100", () => {
    expect(chunks(Array.from({ length: 205 }, (_, i) => i)).map((batch) => batch.length)).toEqual([100, 100, 5]);
  });
});

describe("hubspotRequest", () => {
  const sleep = vi.fn(() => Promise.resolve());
  beforeEach(() => sleep.mockClear());

  it("sends the token as a bearer header and returns the JSON body", async () => {
    const send = vi.fn(() => Promise.resolve(Response.json({ ok: true })));
    await expect(hubspotRequest("t0k", "POST", "/x", { a: 1 }, { fetch: send, sleep })).resolves.toEqual({ ok: true });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.hubapi.com/x");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t0k");
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("retries 429 after Retry-After and 5xx, then succeeds", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ done: true }));
    await expect(hubspotRequest("t", "GET", "/x", undefined, { fetch: send, sleep })).resolves.toEqual({ done: true });
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
  });

  it("gives up after three rate-limited attempts", async () => {
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 429 })));
    await expect(hubspotRequest("t", "GET", "/x", undefined, { fetch: send, sleep })).rejects.toBeInstanceOf(HubSpotError);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("returns null for 404", async () => {
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 404 })));
    await expect(hubspotRequest("t", "GET", "/x", undefined, { fetch: send, sleep })).resolves.toBeNull();
  });

  it("throws HubSpot's message on other errors, without retrying", async () => {
    const send = vi.fn(() => Promise.resolve(Response.json({ message: "Property values were not valid" }, { status: 400 })));
    await expect(hubspotRequest("t", "POST", "/x", {}, { fetch: send, sleep })).rejects.toThrow(
      "HubSpot 400: Property values were not valid",
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("ensureCompanyIdProperty", () => {
  const sleep = () => Promise.resolve();
  afterEach(() => vi.restoreAllMocks());

  it("creates the unique property only when it's missing", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json({ name: COMPANY_ID_PROPERTY }, { status: 201 }));
    await ensureCompanyIdProperty("t", { fetch: send, sleep });
    const [, init] = send.mock.calls[1] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({ name: COMPANY_ID_PROPERTY, hasUniqueValue: true });
  });

  it("does nothing when the property exists", async () => {
    const send = vi.fn(() => Promise.resolve(Response.json({ name: COMPANY_ID_PROPERTY })));
    await ensureCompanyIdProperty("t", { fetch: send, sleep });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
