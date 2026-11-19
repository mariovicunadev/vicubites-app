import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { getAppUrl } from "../lib/app-url.server";
import { refreshStaleJobs } from "../lib/bulk/jobs.server";
import { toJobView } from "../lib/bulk/job-view";
import { FUNNEL_DAYS } from "../lib/refill/events";
import { loadReminderMetrics } from "../lib/refill/events.server";
import { DUE_SOON_DAYS, REFERENCE_DAILY_KCAL } from "../lib/refill/forecast";
import { connectRefillPixel, findRefillPixel, syncRefillPixel } from "../lib/refill/pixel.server";
import { countOptedOut } from "../lib/refill/preference.server";
import { loadReminderStatus, sendDueReminders, type ChannelStatus } from "../lib/refill/reminders.server";
import { loadMissingDefinitions } from "../lib/refill/definitions.server";
import { loadForecasts, processLatestRefillLoad, rewriteForecasts, startRefillLoad } from "../lib/refill/store.server";
import { toRefillRow, type RefillRow } from "../lib/refill/view";
import { authenticate } from "../shopify.server";

const POLL_INTERVAL_MS = 3000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let error: string | null = null;
  let load = null;
  let pixelConnected = false;
  let missingDefinitions: { key: string; type: string }[] = [];
  try {
    missingDefinitions = await loadMissingDefinitions(admin.graphql);
    await refreshStaleJobs(admin.graphql, session.shop);
    load = await processLatestRefillLoad(admin.graphql, session.shop);
    const pixel = await findRefillPixel(admin.graphql);
    // The app's URL changes with each development tunnel: keep the pixel pointed at it.
    if (pixel) await syncRefillPixel(admin.graphql, pixel, getAppUrl());
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
    missingDefinitions,
    funnel: await loadReminderMetrics(session.shop),
    reminders: await loadReminderStatus(session.shop),
    optedOut: await countOptedOut(session.shop),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const intent = (await request.formData()).get("intent");
  try {
    if (intent === "connect-pixel") await connectRefillPixel(admin.graphql, getAppUrl());
    else if (intent === "send-reminders") return { error: null, runs: await sendDueReminders(admin.graphql, session.shop) };
    else if (intent === "rewrite-forecasts") return { error: null, rewritten: await rewriteForecasts(admin.graphql, session.shop) };
    else await startRefillLoad(admin.graphql, session.shop);
    return { error: null };
  } catch (error) {
    if (error instanceof AdminApiError) return { error: error.message };
    throw error;
  }
};

export default function RefillRadar() {
  const { load, dueSoon, later, pixelConnected, missingDefinitions, funnel, reminders, optedOut, error: loadError } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const rewriteFetcher = useFetcher<typeof action>();
  const rewritten = rewriteFetcher.data && "rewritten" in rewriteFetcher.data ? rewriteFetcher.data.rewritten : null;
  const pixelFetcher = useFetcher<typeof action>();
  const reminderFetcher = useFetcher<typeof action>();
  const runs = reminderFetcher.data && "runs" in reminderFetcher.data ? reminderFetcher.data.runs : null;
  const revalidator = useRevalidator();
  const running = fetcher.state !== "idle" || Boolean(load?.running);
  const error =
    fetcher.data?.error ?? pixelFetcher.data?.error ?? reminderFetcher.data?.error ?? rewriteFetcher.data?.error ?? loadError;
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
      <div className="et-actions">
        <button
          type="button"
          className="et-button"
          onClick={() => rewriteFetcher.submit({ intent: "rewrite-forecasts" }, { method: "post" })}
          disabled={running || rewriteFetcher.state !== "idle"}
        >
          Rewrite forecasts
        </button>
        <button
          type="button"
          className="et-button et-button--primary"
          onClick={() => fetcher.submit({ intent: "rebuild" }, { method: "post" })}
          disabled={running}
        >
          Rebuild from orders
        </button>
      </div>

      {missingDefinitions.length > 0 && (
        <div className="et-banner et-banner--warning" role="alert">
          <strong>Customer metafield definitions are missing</strong>
          The store lacks {missingDefinitions.map((definition) => `${definition.key} (${definition.type})`).join(", ")}.
          Reminders, the Reorder button or the refill reward stop working without them. Deploy a new app
          version that changes those entries in the app configuration, then rewrite forecasts.
        </div>
      )}
      {rewritten !== null && (
        <div className="et-banner et-banner--success" role="status">
          <strong>Forecasts rewritten</strong>
          {rewritten} customers updated from stored purchases. No reminders were sent.
        </div>
      )}

      {error && (
        <div className="et-banner" role="alert">
          <strong>Refill Radar could not be updated</strong>
          {error}
        </div>
      )}
      {load?.failed && (
        <div className="et-banner" role="alert">
          <strong>The last rebuild failed</strong>
          Shopify reported {load.failed}. Rebuild again.
        </div>
      )}
      {running && (
        <div className="et-banner et-banner--info" role="status">
          <strong>Rebuild in progress</strong>
          Reading orders through a bulk operation. Forecasts appear here when it finishes.
        </div>
      )}

      {total === 0 ? (
        <div className="et-panel et-empty">
          <h3>No forecasts yet</h3>
          <p>
            Rebuild from orders to forecast when each customer&apos;s dry food runs out. New
            orders update the forecast as they arrive.
          </p>
        </div>
      ) : (
        <>
          <section className="et-section" aria-labelledby="refill-due">
            <h2 id="refill-due" className="et-section__heading">
              Due within {DUE_SOON_DAYS} days
            </h2>
            {dueSoon.length === 0 ? (
              <div className="et-panel et-copy">
                <p>No customer is due soon.</p>
              </div>
            ) : (
              <div className="et-panel et-table__scroll">
                <ForecastTable rows={dueSoon} />
              </div>
            )}
          </section>
          <section className="et-section" aria-labelledby="refill-later">
            <h2 id="refill-later" className="et-section__heading">
              Later
            </h2>
            {later.length === 0 ? (
              <div className="et-panel et-copy">
                <p>Every forecast is due soon.</p>
              </div>
            ) : (
              <div className="et-panel et-table__scroll">
                <ForecastTable rows={later} />
              </div>
            )}
          </section>
          <section className="et-section" aria-labelledby="refill-reorders">
            <h2 id="refill-reorders" className="et-section__heading">
              Reorders, last {FUNNEL_DAYS} days
            </h2>
            <div className="et-panel et-copy">
              <p>
                Dry food reorders from returning customers: {funnel.repeatOrders}.
              </p>
              <p>
                Storefront reminders: browsers that saw one: {funnel.viewed} · clicked Reorder:{" "}
                {funnel.clicked} · reordered after a reminder: {funnel.reorders}.
              </p>
              <p className="et-inline" role="group">
                <span className={`et-badge et-badge--${pixelConnected ? "success" : "caution"}`}>
                  {pixelConnected ? "Pixel connected" : "Pixel not connected"}
                </span>
                <button
                  type="button"
                  className="et-button"
                  onClick={() => pixelFetcher.submit({ intent: "connect-pixel" }, { method: "post" })}
                  disabled={pixelFetcher.state !== "idle"}
                >
                  {pixelConnected ? "Reconnect pixel" : "Connect pixel"}
                </button>
              </p>
              <p className="muted">
                Reorders come from order webhooks and include every customer. Reminder figures come
                from the pixel, which loads only for visitors who allow analytics and isn&apos;t
                blocked by their browser, so read them as a minimum. The pixel sends no customer
                details: views and checkouts are linked by the browser, not by the customer.
              </p>
            </div>
          </section>
          <section className="et-section" aria-labelledby="refill-reminders">
            <h2 id="refill-reminders" className="et-section__heading">
              Reminders
            </h2>
            <div className="et-panel et-copy">
              <p className="et-inline" role="group">
                <span className={`et-badge et-badge--${reminders.KLAVIYO.connected ? "success" : "caution"}`}>
                  {reminders.KLAVIYO.connected ? "Klaviyo connected" : "Klaviyo not connected"}
                </span>
                <span className="et-badge et-badge--success">Flow trigger on</span>
                <button
                  type="button"
                  className="et-button"
                  onClick={() => reminderFetcher.submit({ intent: "send-reminders" }, { method: "post" })}
                  disabled={reminderFetcher.state !== "idle"}
                >
                  Send due reminders
                </button>
              </p>
              {runs && (
                <p>
                  {runs.KLAVIYO
                    ? `Klaviyo: sent ${runs.KLAVIYO.sent} · already sent ${runs.KLAVIYO.skipped} · failed ${runs.KLAVIYO.failed}. `
                    : ""}
                  Flow: sent {runs.FLOW?.sent ?? 0} · already sent {runs.FLOW?.skipped ?? 0} · failed{" "}
                  {runs.FLOW?.failed ?? 0}.
                </p>
              )}
              <p>Klaviyo: {channelSummary(reminders.KLAVIYO)}</p>
              <p>Flow: {channelSummary(reminders.FLOW)}</p>
              <p>
                Customers who turned reminders off in checkout: {optedOut}. They get no Klaviyo event or Flow
                trigger.
              </p>
              <p className="muted">
                {`Every forecast due within ${DUE_SOON_DAYS} days is delivered once per run-out date on each channel, after each order and on demand. Flow: the "Refill due" trigger starts the store's own workflows. Klaviyo: one "Refill Due" event, which a Klaviyo flow turns into an email.`}
                {reminders.KLAVIYO.connected
                  ? ""
                  : " Set KLAVIYO_PRIVATE_KEY (scope events:write) in the app's environment to send Klaviyo events."}
              </p>
            </div>
          </section>
          <section className="et-section" aria-labelledby="refill-how">
            <h2 id="refill-how" className="et-section__heading">
              How forecasts work
            </h2>
            <div className="et-panel et-copy">
              <p>
                With two or more orders, the forecast follows the customer&apos;s own reorder
                cadence (the median days between orders). After a first order it is an
                estimate from the bag&apos;s calories and a reference intake of{" "}
                {REFERENCE_DAILY_KCAL.dog} kcal a day for a dog and {REFERENCE_DAILY_KCAL.cat}{" "}
                for a cat. Last rebuild: {load?.completedAt ?? "—"}.
              </p>
            </div>
          </section>
        </>
      )}
    </s-page>
  );
}

function ForecastTable({ rows }: { rows: RefillRow[] }) {
  return (
    <table className="et-table">
      <thead>
        <tr>
          <th scope="col">Customer</th>
          <th scope="col">Pet</th>
          <th scope="col">Runs out</th>
          <th scope="col">Basis</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.customerId}-${row.species}`}>
            <td>
              <a href={`shopify://admin/customers/${row.adminId}`} target="_top">
                Customer {row.adminId}
              </a>
            </td>
            <td>{row.species}</td>
            <td>
              <span className="et-inline nowrap">
                <span>{row.runOutOn}</span>
                <span className={`et-badge et-badge--${row.tone}`}>{row.due}</span>
              </span>
            </td>
            <td>
              <span className="issues">{row.basis}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
