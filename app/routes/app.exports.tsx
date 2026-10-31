import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { createBulkJob, listBulkJobs, refreshUnfinishedJobs } from "../lib/bulk/jobs.server";
import { toJobView, type BulkJobView } from "../lib/bulk/job-view";
import { CATALOG_EXPORT_QUERY } from "../lib/catalog/export";
import { authenticate } from "../shopify.server";

const POLL_INTERVAL_MS = 3000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let refreshError: string | null = null;
  try {
    await refreshUnfinishedJobs(admin.graphql, session.shop);
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    refreshError = error.message;
  }

  const jobs = await listBulkJobs(session.shop);
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
      <s-button
        slot="primary-action"
        variant="primary"
        icon="export"
        onClick={startExport}
        {...(starting || anyRunning ? { disabled: true } : {})}
      >
        Export catalog
      </s-button>

      {error && (
        <s-banner heading="The export could not be updated" tone="critical">
          {error}
        </s-banner>
      )}

      <s-section heading="Catalog exports">
        <s-paragraph>
          Exports every product with its variants, metafields and media through a
          bulk operation, then builds a CSV with one row per variant. Shopify keeps
          each result for seven days.
        </s-paragraph>
        {jobs.length === 0 ? (
          <s-paragraph>No exports yet.</s-paragraph>
        ) : (
          <JobsTable jobs={jobs} />
        )}
      </s-section>
    </s-page>
  );
}

function JobsTable({ jobs }: { jobs: BulkJobView[] }) {
  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Started</s-table-header>
        <s-table-header>Status</s-table-header>
        <s-table-header format="numeric">Products</s-table-header>
        <s-table-header format="numeric">Objects</s-table-header>
        <s-table-header>Result</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {jobs.map((job) => (
          <s-table-row key={job.id}>
            <s-table-cell>{job.createdAt}</s-table-cell>
            <s-table-cell>
              <s-badge tone={job.tone}>
                {job.errorCode ? `${job.status} · ${job.errorCode}` : job.status}
              </s-badge>
            </s-table-cell>
            <s-table-cell>{job.roots}</s-table-cell>
            <s-table-cell>{job.objects}</s-table-cell>
            <s-table-cell>
              <DownloadCell job={job} />
            </s-table-cell>
          </s-table-row>
        ))}
      </s-table-body>
    </s-table>
  );
}

function DownloadCell({ job }: { job: BulkJobView }) {
  const shopify = useAppBridge();
  const [busy, setBusy] = useState(false);

  if (job.download === "none") return <s-text color="subdued">—</s-text>;
  if (job.download === "expired") {
    return <s-text color="subdued">Expired after 7 days</s-text>;
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
    <s-button
      variant="tertiary"
      icon="download"
      onClick={download}
      {...(busy ? { loading: true } : {})}
    >
      {job.download === "partial" ? "Partial CSV" : "CSV"}
    </s-button>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
