import { describe, expect, it, vi } from "vitest";

import { createKlaviyoEvent, KlaviyoError, retryAfterSeconds } from "./client.server";
import { KLAVIYO_REVISION, refillDueEvent, refillDueUniqueId, REFILL_DUE_METRIC, type RefillDue } from "./event";

const reminder: RefillDue = {
  customerId: "gid://shopify/Customer/42",
  email: "demo@example.com",
  species: "dog",
  basis: "cadence",
  daysOfFood: 30,
  runOutOn: "2026-11-09",
  daysLeft: 5,
};

describe("refillDueEvent", () => {
  it("builds a JSON:API event for the profile's email", () => {
    const body = refillDueEvent(reminder, new Date("2026-11-04T12:00:00Z"));
    expect(body.data.attributes.metric.data.attributes.name).toBe(REFILL_DUE_METRIC);
    expect(body.data.attributes.profile.data.attributes.email).toBe("demo@example.com");
    expect(body.data.attributes.properties).toEqual({
      species: "dog",
      run_out_on: "2026-11-09",
      days_left: 5,
      basis: "cadence",
      days_of_food: 30,
    });
    expect(body.data.attributes.time).toBe("2026-11-04T12:00:00.000Z");
  });

  it("keys each reminder by customer, species and run-out date", () => {
    expect(refillDueUniqueId("gid://shopify/Customer/42", "cat", "2026-12-09")).toBe("refill-due:42:cat:2026-12-09");
    expect(refillDueEvent(reminder, new Date()).data.attributes.unique_id).toBe("refill-due:42:dog:2026-11-09");
  });
});

describe("retryAfterSeconds", () => {
  it("reads seconds, caps them and falls back to a default", () => {
    expect(retryAfterSeconds("3")).toBe(3);
    expect(retryAfterSeconds("120")).toBe(10);
    expect(retryAfterSeconds(null)).toBe(1);
    expect(retryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT")).toBe(1);
  });
});

describe("createKlaviyoEvent", () => {
  const body = refillDueEvent(reminder, new Date());
  const sleep = vi.fn(() => Promise.resolve());

  it("sends the key, revision and body", async () => {
    const send = vi.fn(() => Promise.resolve(new Response(null, { status: 202 })));
    await createKlaviyoEvent("pk_test", body, { fetch: send, sleep });
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://a.klaviyo.com/api/events");
    expect(init.headers).toMatchObject({ Authorization: "Klaviyo-API-Key pk_test", revision: KLAVIYO_REVISION });
    expect(JSON.parse(String(init.body))).toEqual(body);
  });

  it("retries a 429 after Retry-After, then succeeds", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }));
    await createKlaviyoEvent("pk_test", body, { fetch: send, sleep });
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it("throws Klaviyo's detail on other errors and gives up after three 429s", async () => {
    const bad = vi.fn(() =>
      Promise.resolve(Response.json({ errors: [{ detail: "Invalid email" }] }, { status: 400 })),
    );
    await expect(createKlaviyoEvent("pk_test", body, { fetch: bad, sleep })).rejects.toThrow("Klaviyo 400: Invalid email");

    const limited = vi.fn(() => Promise.resolve(new Response(null, { status: 429 })));
    await expect(createKlaviyoEvent("pk_test", body, { fetch: limited, sleep })).rejects.toBeInstanceOf(KlaviyoError);
    expect(limited).toHaveBeenCalledTimes(3);
  });
});
