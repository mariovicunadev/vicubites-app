import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { refreshStaleJobs } from "../lib/bulk/jobs.server";
import { toJobView } from "../lib/bulk/job-view";
import { FUNNEL_DAYS } from "../lib/refill/events";
import { loadReminderMetrics } from "../lib/refill/events.server";
import { DUE_SOON_DAYS, REFERENCE_DAILY_KCAL } from "../lib/refill/forecast";
import { connectRefillPixel, findRefillPixel, syncRefillPixel } from "../lib/refill/pixel.server";
import { loadReminderStatus, sendDueReminders, type ChannelStatus } from "../lib/refill/reminders.server";
import { loadForecasts, processLatestRefillLoad, startRefillLoad } from "../lib/refill/store.server";
import { toRefillRow, type RefillRow } from "../lib/refill/view";
import { authenticate } from "../shopify.server";

const POLL_INTERVAL_MS = 3000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let error: string | null = null;
  let load = null;
  let pixelConnected = false;
  try {
    await refreshStaleJobs(admin.graphql, session.shop);
    load = await processLatestRefillLoad(admin.graphql, session.shop);
    const pixel = await findRefillPixel(admin.graphql);
    // The app's URL changes with each development tunnel: keep the pixel pointed at it.
    if (pixel) await syncRefillPixel(admin.graphql, pixel, process.env.SHOPIFY_APP_URL ?? "");
    pixelConnected = pixel !== null;
  } catch (caught) {
    if (!(caught instanceof AdminApiError)) throw caught;
    error = caught.message;
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = (await loadForecasts(session.shop)).map((forecast) => toRefillRow(forecast, today));
  const loadView = load ? toJobView(load) : null;
  return {
    error,
    load: loadView && {
      running: loadView.running || (load?.status === "COMPLETED" && !load.processedAt),
      failed: load?.status === "FAILED" ? (loadView.errorCode ?? "FAILED") : null,
      completedAt: loadView.completedAt,
    },
    dueSoon: rows.filter((row) => row.dueSoon),
    later: rows.filter((row) => !row.dueSoon),
    pixelConnected,
    funnel: await loadReminderMetrics(session.shop),
    reminders: await loadReminderStatus(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const intent = (await request.formData()).get("intent");
  try {
    if (intent === "connect-pixel") await connectRefillPixel(admin.graphql, process.env.SHOPIFY_APP_URL ?? "");
    else if (intent === "send-reminders") return { error: null, runs: await sendDueReminders(admin.graphql, session.shop) };
    else await startRefillLoad(admin.graphql, session.shop);
    return { error: null };
  } catch (error) {
    if (error instanceof AdminApiError) return { error: error.message };
    throw error;
  }
};

export default function RefillRadar() {
  const { load, dueSoon, later, pixelConnected, funnel, reminders, error: loadError } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const pixelFetcher = useFetcher<typeof action>();
  const reminderFetcher = useFetcher<typeof action>();
  const runs = reminderFetcher.data && "runs" in reminderFetcher.data ? reminderFetcher.data.runs : null;
  const revalidator = useRevalidator();
  const running = fetcher.state !== "idle" || Boolean(load?.running);
  const error = fetcher.data?.error ?? pixelFetcher.data?.error ?? reminderFetcher.data?.error ?? loadError;
  const total = dueSoon.length + later.length;

  useEffect(() => {
    if (!load?.running) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load?.running, revalidator]);

  return (
    <s-page heading="Refill Radar">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => fetcher.submit({ intent: "rebuild" }, { method: "post" })}
        {...(running ? { disabled: true } : {})}
      >
        Rebuild from orders
      </s-button>

      {error && (
        <s-banner heading="Refill Radar could not be updated" tone="critical">
          {error}
        </s-banner>
      )}
      {load?.failed && (
        <s-banner heading="The last rebuild failed" tone="critical">
          Shopify reported {load.failed}. Rebuild again.
        </s-banner>
      )}
      {running && (
        <s-banner heading="Rebuild in progress" tone="info">
          Reading orders through a bulk operation. Forecasts appear here when it finishes.
        </s-banner>
      )}

      {total === 0 ? (
        <s-section>
          <s-empty-state heading="No forecasts yet">
            <s-paragraph>
              Rebuild from orders to forecast when each customer&apos;s dry food runs out. New
              orders update the forecast as they arrive.
            </s-paragraph>
          </s-empty-state>
        </s-section>
      ) : (
        <>
          <s-section heading={`Due within ${DUE_SOON_DAYS} days`}>
            {dueSoon.length === 0 ? (
              <s-paragraph>No customer is due soon.</s-paragraph>
            ) : (
              <ForecastTable rows={dueSoon} />
            )}
          </s-section>
          <s-section heading="Later">
            {later.length === 0 ? (
              <s-paragraph>Every forecast is due soon.</s-paragraph>
            ) : (
              <ForecastTable rows={later} />
            )}
          </s-section>
          <s-section heading={`Reorders, last ${FUNNEL_DAYS} days`}>
            <s-stack direction="block" gap="base">
              <s-paragraph>
                Dry food reorders from returning customers: {funnel.repeatOrders}.
              </s-paragraph>
              <s-paragraph>
                Storefront reminders: browsers that saw one: {funnel.viewed} · clicked Reorder:{" "}
                {funnel.clicked} · reordered after a reminder: {funnel.reorders}.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200">
                <s-badge tone={pixelConnected ? "success" : "warning"}>
                  {pixelConnected ? "Pixel connected" : "Pixel not connected"}
                </s-badge>
                <s-button
                  onClick={() => pixelFetcher.submit({ intent: "connect-pixel" }, { method: "post" })}
                  {...(pixelFetcher.state !== "idle" ? { disabled: true } : {})}
                >
                  {pixelConnected ? "Reconnect pixel" : "Connect pixel"}
                </s-button>
              </s-stack>
              <s-text color="subdued">
                Reorders come from order webhooks and include every customer. Reminder figures come
                from the pixel, which loads only for visitors who allow analytics and isn&apos;t
                blocked by their browser, so read them as a minimum. The pixel sends no customer
                details: views and checkouts are linked by the browser, not by the customer.
              </s-text>
            </s-stack>
          </s-section>
          <s-section heading="Reminders">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small-200">
                <s-badge tone={reminders.KLAVIYO.connected ? "success" : "warning"}>
                  {reminders.KLAVIYO.connected ? "Klaviyo connected" : "Klaviyo not connected"}
                </s-badge>
                <s-badge tone="success">Flow trigger on</s-badge>
                <s-button
                  onClick={() => reminderFetcher.submit({ intent: "send-reminders" }, { method: "post" })}
                  {...(reminderFetcher.state !== "idle" ? { disabled: true } : {})}
                >
                  Send due reminders
                </s-button>
              </s-stack>
              {runs && (
                <s-paragraph>
                  {runs.KLAVIYO
                    ? `Klaviyo: sent ${runs.KLAVIYO.sent} · already sent ${runs.KLAVIYO.skipped} · failed ${runs.KLAVIYO.failed}. `
                    : ""}
                  Flow: sent {runs.FLOW?.sent ?? 0} · already sent {runs.FLOW?.skipped ?? 0} · failed{" "}
                  {runs.FLOW?.failed ?? 0}.
                </s-paragraph>
              )}
              <s-paragraph>Klaviyo: {channelSummary(reminders.KLAVIYO)}</s-paragraph>
              <s-paragraph>Flow: {channelSummary(reminders.FLOW)}</s-paragraph>
              <s-text color="subdued">
                {`Every forecast due within ${DUE_SOON_DAYS} days is delivered once per run-out date on each channel, after each order and on demand. Flow: the "Refill due" trigger starts the store's own workflows. Klaviyo: one "Refill Due" event, which a Klaviyo flow turns into an email.`}
                {reminders.KLAVIYO.connected
                  ? ""
                  : " Set KLAVIYO_PRIVATE_KEY (scope events:write) in the app's environment to send Klaviyo events."}
              </s-text>
            </s-stack>
          </s-section>
          <s-section heading="How forecasts work">
            <s-paragraph>
              With two or more orders, the forecast follows the customer&apos;s own reorder
              cadence (the median days between orders). After a first order it is an
              estimate from the bag&apos;s calories and a reference intake of{" "}
              {REFERENCE_DAILY_KCAL.dog} kcal a day for a dog and {REFERENCE_DAILY_KCAL.cat}{" "}
              for a cat. Last rebuild: {load?.completedAt ?? "—"}.
            </s-paragraph>
          </s-section>
        </>
      )}
    </s-page>
  );
}

function ForecastTable({ rows }: { rows: RefillRow[] }) {
  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Customer</s-table-header>
        <s-table-header>Pet</s-table-header>
        <s-table-header>Runs out</s-table-header>
        <s-table-header>Basis</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {rows.map((row) => (
          <s-table-row key={`${row.customerId}-${row.species}`}>
            <s-table-cell>
              <s-link href={`shopify://admin/customers/${row.adminId}`} target="_top">
                Customer {row.adminId}
              </s-link>
            </s-table-cell>
            <s-table-cell>{row.species}</s-table-cell>
            <s-table-cell>
              <s-stack direction="inline" gap="small-200">
                <s-text>{row.runOutOn}</s-text>
                <s-badge tone={row.tone}>{row.due}</s-badge>
              </s-stack>
            </s-table-cell>
            <s-table-cell>
              <s-text color="subdued">{row.basis}</s-text>
            </s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function channelSummary({ lastSentAt, sent, failed }: ChannelStatus): string {
  return lastSentAt
    ? `sent ${sent} · failed ${failed} · last run ${lastSentAt.slice(0, 16).replace("T", " ")} UTC.`
    : "nothing sent yet.";
}
