import type { LoaderFunctionArgs } from "react-router";

import { findBulkJob, refreshJob } from "../lib/bulk/jobs.server";
import { downloadBulkResult } from "../lib/bulk/operations.server";
import { isExpired } from "../lib/bulk/status";
import { catalogCsv } from "../lib/catalog/export";
import { authenticate } from "../shopify.server";

/**
 * Resource route: turns a finished catalog export into a CSV. The signed
 * result URL stays on the server; the browser only receives the CSV.
 */
export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const stored = await findBulkJob(session.shop, params.jobId ?? "");
  if (!stored) {
    return new Response("Export not found.", { status: 404 });
  }
  if (isExpired(stored.urlExpiresAt)) {
    return new Response("This export expired: Shopify keeps results for seven days.", {
      status: 410,
    });
  }

  // The webhook records the status without a URL; GraphQL returns it.
  const job = stored.url || stored.partialDataUrl ? stored : await refreshJob(admin.graphql, stored);
  const url = job.status === "COMPLETED" ? job.url : job.partialDataUrl;
  if (!url) {
    return new Response("This export has no result to download yet.", { status: 409 });
  }

  const products = await downloadBulkResult(url);
  const rows = catalogCsv(products);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = rows.next();
      if (next.done) controller.close();
      else controller.enqueue(encoder.encode(next.value));
    },
  });

  const date = job.createdAt.toISOString().slice(0, 10);
  const suffix = job.status === "COMPLETED" ? "" : "-partial";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vicubites-catalog-${date}${suffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
