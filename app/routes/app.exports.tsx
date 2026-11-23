import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { ScrollRegion } from "../components/et/ScrollRegion";
import { AdminApiError } from "../lib/admin/errors";
import { createBulkJob, listBulkJobs, refreshStaleJobs } from "../lib/bulk/jobs.server";
import { toJobView, type BulkJobView } from "../lib/bulk/job-view";
import { CATALOG_EXPORT_QUERY } from "../lib/catalog/export";
import { authenticate } from "../shopify.server";

const POLL_INTERVAL_MS = 3000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let refreshError: string | null = null;
  try {
    await refreshStaleJobs(admin.graphql, session.shop);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    refreshError = error.message;
  }

  const jobs = await listBulkJobs(session.shop, "catalog");
  return { jobs: jobs.map((job) => toJobView(job)), refreshError };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    await createBulkJob(admin.graphql, session.shop, "catalog", CATALOG_EXPORT_QUERY);
    return { error: null };
  } catch (error) {
    if (error instanceof AdminApiError) return { error: error.message };
    throw error;
  }
};

export default function Exports() {
  const { jobs, refreshError } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const starting = fetcher.state !== "idle";
  const anyRunning = jobs.some((job) => job.running);

  // Poll while an operation is in progress; the webhook usually lands first.
  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [anyRunning, revalidator]);

  const startExport = () => fetcher.submit({}, { method: "post" });
  const error = fetcher.data?.error ?? refreshError;

  return (
    <s-page heading="Exports">
      <div className="et-actions">
        <button
          type="button"
          className="et-button et-button--primary"
          onClick={startExport}
          disabled={starting || anyRunning}
          aria-busy={starting}
        >
          {starting ? "Starting export…" : "Export catalog"}
        </button>
      </div>

      {error && (
        <div className="et-banner" role="alert">
          <strong>The export could not be updated</strong>
          {error}
        </div>
      )}

      <section className="et-section" aria-labelledby="exports-catalog">
        <h2 id="exports-catalog" className="et-section__heading">Catalog exports</h2>
        <div className="et-panel">
          <div className="et-copy et-operation-copy">
            <p>
              Exports every product with its variants, metafields and media through a
              bulk operation, then builds a CSV with one row per variant. Shopify keeps
              each result for seven days.
            </p>
          </div>
          {jobs.length === 0 ? (
            <div className="et-empty"><h3>No exports yet.</h3></div>
          ) : (
            <JobsTable jobs={jobs} />
          )}
        </div>
      </section>
    </s-page>
  );
}

function JobsTable({ jobs }: { jobs: BulkJobView[] }) {
  return (
    <ScrollRegion label="Catalog export jobs">
      <table className="et-table et-table--operations">
        <thead>
          <tr>
            <th scope="col">Started</th>
            <th scope="col">Status</th>
            <th scope="col" className="num">Products</th>
            <th scope="col" className="num">Objects</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job.id}>
              <td className="nowrap">{job.createdAt}</td>
              <td>
                <span className={`et-badge et-badge--${job.tone === "warning" ? "caution" : job.tone}`}>
                  {job.errorCode ? `${job.status} · ${job.errorCode}` : job.status}
                </span>
              </td>
              <td className="num">{job.roots}</td>
              <td className="num">{job.objects}</td>
              <td><DownloadCell job={job} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function DownloadCell({ job }: { job: BulkJobView }) {
  const shopify = useAppBridge();
  const [busy, setBusy] = useState(false);

  if (job.download === "none") return <span className="issues">—</span>;
  if (job.download === "expired") {
    return <span className="issues">Expired after 7 days</span>;
  }

  // App Bridge adds the session token to same-origin fetches, which a plain
  // link inside the admin iframe wouldn't carry.
  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/app/exports/${job.id}/download`);
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
        "catalog.csv";
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      shopify.toast.show(error instanceof Error ? error.message : "Download failed", {
        isError: true,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className="et-button et-button--compact"
      onClick={download}
      disabled={busy}
      aria-busy={busy}
      aria-label={`${job.download === "partial" ? "Download partial CSV" : "Download CSV"} from ${job.createdAt}`}
    >
      {busy ? "Downloading…" : job.download === "partial" ? "Partial CSV" : "CSV"}
    </button>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
