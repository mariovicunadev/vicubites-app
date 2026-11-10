import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  refillForecast: { findMany: vi.fn() },
  refillReminder: { findMany: vi.fn(), upsert: vi.fn() },
  refillPreference: { findMany: vi.fn() },
}));
const fireRefillDue = vi.hoisted(() => vi.fn());
const createKlaviyoEvent = vi.hoisted(() => vi.fn());
const adminGraphql = vi.hoisted(() => vi.fn());

vi.mock("../../db.server", () => ({ default: db }));
vi.mock("../flow/trigger.server", () => ({ fireRefillDue }));
vi.mock("../klaviyo/client.server", () => ({ createKlaviyoEvent }));
vi.mock("../admin/graphql.server", () => ({ adminGraphql }));

import { sendDueReminders } from "./reminders.server";

const now = new Date("2026-11-04T12:00:00Z");
const graphql = vi.fn() as never;
const forecast = {
  shop: "vicubites.myshopify.com",
  customerId: "gid://shopify/Customer/1",
  species: "dog",
  basis: "cadence",
  daysOfFood: 30,
  runOutOn: "2026-11-10",
};

describe("sendDueReminders", () => {
  beforeEach(() => {
    db.refillForecast.findMany.mockResolvedValue([forecast]);
    db.refillReminder.findMany.mockResolvedValue([]);
    db.refillReminder.upsert.mockResolvedValue({});
    db.refillPreference.findMany.mockResolvedValue([]);
    adminGraphql.mockResolvedValue({
      nodes: [{ id: forecast.customerId, defaultEmailAddress: { emailAddress: "a@example.com" } }],
    });
  });
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("fires Flow without a Klaviyo key", async () => {
    vi.stubEnv("KLAVIYO_PRIVATE_KEY", "");
    const runs = await sendDueReminders(graphql, forecast.shop, { now });
    expect(runs.KLAVIYO).toBeNull();
    expect(runs.FLOW).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(fireRefillDue).toHaveBeenCalledWith(graphql, expect.objectContaining({ customerId: forecast.customerId, daysLeft: 6 }));
    expect(createKlaviyoEvent).not.toHaveBeenCalled();
  });

  it("keeps sending to Klaviyo when Flow fails, and records each channel", async () => {
    vi.stubEnv("KLAVIYO_PRIVATE_KEY", "test-key");
    fireRefillDue.mockRejectedValueOnce(new Error("Flow down"));
    const runs = await sendDueReminders(graphql, forecast.shop, { now });
    expect(runs.FLOW).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(runs.KLAVIYO).toEqual({ sent: 1, skipped: 0, failed: 0 });
    const statuses = db.refillReminder.upsert.mock.calls.map(([args]) => [args.create.channel, args.create.status]);
    expect(statuses).toEqual([
      ["KLAVIYO", "SENT"],
      ["FLOW", "FAILED"],
    ]);
  });

  it("keeps firing Flow when Klaviyo fails", async () => {
    vi.stubEnv("KLAVIYO_PRIVATE_KEY", "test-key");
    createKlaviyoEvent.mockRejectedValueOnce(new Error("Klaviyo down"));
    const runs = await sendDueReminders(graphql, forecast.shop, { now });
    expect(runs.KLAVIYO).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(runs.FLOW).toEqual({ sent: 1, skipped: 0, failed: 0 });
  });

  it("skips what each channel already sent", async () => {
    vi.stubEnv("KLAVIYO_PRIVATE_KEY", "test-key");
    db.refillReminder.findMany.mockResolvedValue([{ ...forecast, channel: "FLOW" }]);
    const runs = await sendDueReminders(graphql, forecast.shop, { now });
    expect(runs.FLOW).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(runs.KLAVIYO).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(fireRefillDue).not.toHaveBeenCalled();
  });

  it("skips customers who turned reminders off, on both channels", async () => {
    vi.stubEnv("KLAVIYO_PRIVATE_KEY", "test-key");
    db.refillPreference.findMany.mockResolvedValue([{ customerId: forecast.customerId }]);
    const runs = await sendDueReminders(graphql, forecast.shop, { now });
    expect(runs.KLAVIYO).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(runs.FLOW).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(db.refillPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ reminders: false }) }),
    );
    expect(fireRefillDue).not.toHaveBeenCalled();
    expect(createKlaviyoEvent).not.toHaveBeenCalled();
    expect(db.refillReminder.upsert).not.toHaveBeenCalled();
  });
});
