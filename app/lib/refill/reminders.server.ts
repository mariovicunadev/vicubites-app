import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { createKlaviyoEvent } from "../klaviyo/client.server";
import { refillDueEvent } from "../klaviyo/event";
import { daysLeft, isDueSoon, type ForecastBasis, type Species } from "./forecast";

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

/**
 * Sends a `Refill Due` event to Klaviyo for every due-soon forecast of the
 * shop (or of one customer) that hasn't been sent for its run-out date yet,
 * and records each result. Does nothing without a Klaviyo key.
 */
export async function sendDueReminders(
  graphql: AdminGraphql,
  shop: string,
  { customerId, now = new Date() }: { customerId?: string; now?: Date } = {},
): Promise<ReminderRun> {
  const run: ReminderRun = { sent: 0, skipped: 0, failed: 0 };
  const apiKey = klaviyoKey();
  if (!apiKey) return run;

  const today = now.toISOString().slice(0, 10);
  const forecasts = (await prisma.refillForecast.findMany({ where: { shop, ...(customerId ? { customerId } : {}) } }))
    .filter((forecast) => isDueSoon(forecast, today));
  if (forecasts.length === 0) return run;

  const sent = await prisma.refillReminder.findMany({
    where: { shop, status: "SENT", customerId: { in: [...new Set(forecasts.map((f) => f.customerId))] } },
    select: { customerId: true, species: true, runOutOn: true },
  });
  const sentKeys = new Set(sent.map((r) => `${r.customerId}|${r.species}|${r.runOutOn}`));
  const pending = forecasts.filter((f) => !sentKeys.has(`${f.customerId}|${f.species}|${f.runOutOn}`));
  run.skipped = forecasts.length - pending.length;
  if (pending.length === 0) return run;

  const emails = await customerEmails(graphql, [...new Set(pending.map((f) => f.customerId))]);
  for (const forecast of pending) {
    const key = { shop, customerId: forecast.customerId, species: forecast.species, runOutOn: forecast.runOutOn };
    let status: ReminderStatus = "SENT";
    let error: string | null = null;
    const email = emails.get(forecast.customerId);
    if (!email) {
      status = "FAILED";
      error = "The customer has no email address.";
    } else {
      try {
        const body = refillDueEvent(
          {
            customerId: forecast.customerId,
            email,
            species: forecast.species as Species,
            basis: forecast.basis as ForecastBasis,
            daysOfFood: forecast.daysOfFood,
            runOutOn: forecast.runOutOn,
            daysLeft: daysLeft(forecast, today),
          },
          now,
        );
        await createKlaviyoEvent(apiKey, body);
      } catch (cause) {
        status = "FAILED";
        error = cause instanceof Error ? cause.message : "Klaviyo request failed.";
      }
    }
    await prisma.refillReminder.upsert({
      where: { shop_customerId_species_runOutOn: key },
      create: { ...key, status, error, sentAt: now },
      update: { status, error, sentAt: now },
    });
    run[status === "SENT" ? "sent" : "failed"]++;
  }
  return run;
}

/** The latest reminder results for the Refill Radar page. */
export async function loadReminderStatus(shop: string) {
  const [last, sent, failed] = await Promise.all([
    prisma.refillReminder.findFirst({ where: { shop }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    prisma.refillReminder.count({ where: { shop, status: "SENT" } }),
    prisma.refillReminder.count({ where: { shop, status: "FAILED" } }),
  ]);
  return { connected: klaviyoKey() !== null, lastSentAt: last?.sentAt.toISOString() ?? null, sent, failed };
}
