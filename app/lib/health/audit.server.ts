import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { BulkJob } from "@prisma/client";

import prisma from "../../db.server";
import { createBulkJob, latestBulkJob, refreshJob } from "../bulk/jobs.server";
import { downloadBulkResult } from "../bulk/operations.server";
import { catalogQuery } from "../catalog/export";
import { loadB2bPublicationIds } from "./b2b.server";
import { productFromNode } from "./product";
import { evaluateProduct, type ProductHealthResult, type RuleResult } from "./score";

type AdminGraphql = AdminApiContext["graphql"];

/**
 * An audit is a catalog bulk export whose result is scored instead of
 * downloaded. It also checks each product against the B2B catalogs.
 */
export async function startAudit(graphql: AdminGraphql, shop: string) {
  const b2bPublicationIds = await loadB2bPublicationIds(graphql);
  return createBulkJob(graphql, shop, "audit", catalogQuery({ b2bPublicationIds }));
}

/**
 * Scores the latest audit once its bulk operation has completed. Idempotent:
 * `processedAt` marks the job as consumed, and the claim is a conditional
 * update so two concurrent page loads can't both process it.
 */
export async function processLatestAudit(graphql: AdminGraphql, shop: string) {
  let job = await latestBulkJob(shop, "audit");
  if (!job || job.processedAt || job.status !== "COMPLETED") return job;
  if (!job.url) job = await refreshJob(graphql, job);
  if (!job.url) return job;

  const claimed = await prisma.bulkJob.updateMany({
    where: { id: job.id, processedAt: null },
    data: { processedAt: new Date() },
  });
  if (claimed.count === 0) return job;

  try {
    const products = await downloadBulkResult(job.url);
    await saveResults(shop, job, products.map((node) => evaluateProduct(productFromNode(node))));
  } catch (error) {
    // Release the claim so the next page load retries.
    await prisma.bulkJob.update({ where: { id: job.id }, data: { processedAt: null } });
    throw error;
  }
  return prisma.bulkJob.findUnique({ where: { id: job.id } });
}

/** Replaces the shop's results in one transaction: deleted products drop out. */
async function saveResults(shop: string, job: BulkJob, results: ProductHealthResult[]) {
  const auditedAt = job.completedAt ?? new Date();
  await prisma.$transaction([
    prisma.productHealth.deleteMany({ where: { shop } }),
    ...results.map((result) =>
      prisma.productHealth.create({
        data: {
          shop,
          productId: result.productId,
          title: result.title,
          handle: result.handle,
          status: result.status,
          score: result.score,
          results: JSON.stringify(result.results),
          auditJobId: job.id,
          auditedAt,
        },
      }),
    ),
  ]);
}

export async function loadHealthResults(shop: string): Promise<ProductHealthResult[]> {
  const rows = await prisma.productHealth.findMany({
    where: { shop },
    orderBy: [{ score: "asc" }, { title: "asc" }],
  });
  return rows.map((row) => ({
    productId: row.productId,
    title: row.title,
    handle: row.handle,
    status: row.status,
    score: row.score,
    results: JSON.parse(row.results) as RuleResult[],
  }));
}
