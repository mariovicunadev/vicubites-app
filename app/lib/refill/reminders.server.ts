import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { fireRefillDue } from "../flow/trigger.server";
import { createKlaviyoEvent } from "../klaviyo/client.server";
import { refillDueEvent } from "../klaviyo/event";
import { daysLeft, isDueSoon, type ForecastBasis, type Species } from "./forecast";
import { optedOutCustomers } from "./preference.server";
import { pendingFor, REMINDER_CHANNELS, type ReminderChannel } from "./reminder-channels";

type AdminGraphql = AdminApiContext["graphql"];

/** Emails are read by ID at send time, never stored or logged. */
const REFILL_REMINDER_EMAILS = `#graphql
  query refillReminderEmails($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Customer {
        id
        defaultEmailAddress {
          emailAddress
        }
      }
    }
  }
`;

/** The `nodes` query takes up to 250 IDs. */
const EMAIL_BATCH = 250;

export type ReminderStatus = "SENT" | "FAILED";

export interface ReminderRun {
  sent: number;
  /** Already sent for the same run-out date. */
  skipped: number;
  failed: number;
}

/** One run per channel; `null` when the channel isn't connected. */
export type ReminderRuns = Record<ReminderChannel, ReminderRun | null>;

/** The Klaviyo private key, from the server environment; null when Klaviyo isn't connected. */
export function klaviyoKey(): string | null {
  return process.env.KLAVIYO_PRIVATE_KEY || null;
}

async function customerEmails(graphql: AdminGraphql, customerIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  for (let start = 0; start < customerIds.length; start += EMAIL_BATCH) {
    const { nodes } = await adminGraphql(graphql, REFILL_REMINDER_EMAILS, {
      variables: { ids: customerIds.slice(start, start + EMAIL_BATCH) },
    });
    for (const node of nodes) {
      const email = node && "defaultEmailAddress" in node ? node.defaultEmailAddress?.emailAddress : null;
      if (node && "id" in node && email) emails.set(node.id, email);
    }
  }
  return emails;
}

type DueForecast = Awaited<ReturnType<typeof prisma.refillForecast.findMany>>[number];

interface Delivery {
  forecast: DueForecast;
  daysLeft: number;
}

/** Sends one reminder on one channel; throws to record a failure. */
type Deliver = (delivery: Delivery) => Promise<void>;

async function klaviyoDelivery(
  graphql: AdminGraphql,
  pending: readonly DueForecast[],
  apiKey: string,
  now: Date,
): Promise<Deliver> {
  const emails = await customerEmails(graphql, [...new Set(pending.map((f) => f.customerId))]);
  return async ({ forecast, daysLeft: left }) => {
    const email = emails.get(forecast.customerId);
    if (!email) throw new Error("The customer has no email address.");
    await createKlaviyoEvent(
      apiKey,
      refillDueEvent(
        {
          customerId: forecast.customerId,
          email,
          species: forecast.species as Species,
          basis: forecast.basis as ForecastBasis,
          daysOfFood: forecast.daysOfFood,
          runOutOn: forecast.runOutOn,
          daysLeft: left,
        },
        now,
      ),
    );
  };
}

function flowDelivery(graphql: AdminGraphql): Deliver {
  return ({ forecast, daysLeft: left }) =>
    fireRefillDue(graphql, {
      customerId: forecast.customerId,
      species: forecast.species as Species,
      runOutOn: forecast.runOutOn,
      daysLeft: left,
      basis: forecast.basis as ForecastBasis,
    });
}

/**
 * Delivers every due-soon forecast of the shop (or of one customer) on each
 * connected channel: a `Refill Due` event in Klaviyo and the `Refill due`
 * Flow trigger. Each channel is deduplicated and recorded on its own, so a
 * failure in one never blocks the other. Flow needs no key: it is always on.
 * Customers who turned reminders off in checkout are skipped on both channels.
 */
export async function sendDueReminders(
  graphql: AdminGraphql,
  shop: string,
  { customerId, now = new Date() }: { customerId?: string; now?: Date } = {},
): Promise<ReminderRuns> {
  const apiKey = klaviyoKey();
  const runs: ReminderRuns = { KLAVIYO: apiKey ? emptyRun() : null, FLOW: emptyRun() };

  const today = now.toISOString().slice(0, 10);
  const dueSoon = (await prisma.refillForecast.findMany({ where: { shop, ...(customerId ? { customerId } : {}) } }))
    .filter((forecast) => isDueSoon(forecast, today));
  if (dueSoon.length === 0) return runs;
  const optedOut = await optedOutCustomers(shop, [...new Set(dueSoon.map((f) => f.customerId))]);
  const forecasts = dueSoon.filter((forecast) => !optedOut.has(forecast.customerId));

  const sent = await prisma.refillReminder.findMany({
    where: { shop, status: "SENT", customerId: { in: [...new Set(forecasts.map((f) => f.customerId))] } },
    select: { customerId: true, species: true, runOutOn: true, channel: true },
  });

  for (const channel of REMINDER_CHANNELS) {
    const run = runs[channel];
    if (!run) continue;
    const pending = pendingFor(channel, forecasts, sent);
    // Already delivered, or the customer turned reminders off.
    run.skipped = dueSoon.length - pending.length;
    if (pending.length === 0) continue;

    let deliver: Deliver;
    try {
      deliver = channel === "KLAVIYO" ? await klaviyoDelivery(graphql, pending, apiKey ?? "", now) : flowDelivery(graphql);
    } catch (cause) {
      // Setting up a channel (reading emails) failed: count its reminders as failed, keep the other channel going.
      run.failed += pending.length;
      console.error(`${channel} reminders not sent`, cause instanceof Error ? cause.message : cause);
      continue;
    }

    for (const forecast of pending) {
      let status: ReminderStatus = "SENT";
      let error: string | null = null;
      try {
        await deliver({ forecast, daysLeft: daysLeft(forecast, today) });
      } catch (cause) {
        status = "FAILED";
        error = cause instanceof Error ? cause.message : `${channel} request failed.`;
      }
      const key = { shop, customerId: forecast.customerId, species: forecast.species, runOutOn: forecast.runOutOn, channel };
      await prisma.refillReminder.upsert({
        where: { shop_customerId_species_runOutOn_channel: key },
        create: { ...key, status, error, sentAt: now },
        update: { status, error, sentAt: now },
      });
      run[status === "SENT" ? "sent" : "failed"]++;
    }
  }
  return runs;
}

function emptyRun(): ReminderRun {
  return { sent: 0, skipped: 0, failed: 0 };
}

export interface ChannelStatus {
  connected: boolean;
  lastSentAt: string | null;
  sent: number;
  failed: number;
}

/** The latest reminder results per channel, for the Refill Radar page. */
export async function loadReminderStatus(shop: string): Promise<Record<ReminderChannel, ChannelStatus>> {
  const status = async (channel: ReminderChannel, connected: boolean): Promise<ChannelStatus> => {
    const [last, sent, failed] = await Promise.all([
      prisma.refillReminder.findFirst({ where: { shop, channel }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
      prisma.refillReminder.count({ where: { shop, channel, status: "SENT" } }),
      prisma.refillReminder.count({ where: { shop, channel, status: "FAILED" } }),
    ]);
    return { connected, lastSentAt: last?.sentAt.toISOString() ?? null, sent, failed };
  };
  const [KLAVIYO, FLOW] = await Promise.all([status("KLAVIYO", klaviyoKey() !== null), status("FLOW", true)]);
  return { KLAVIYO, FLOW };
}
