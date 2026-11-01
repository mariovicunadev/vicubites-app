import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { BulkJob } from "@prisma/client";

import prisma from "../../db.server";
import {
  getBulkOperation,
  stageBulkVariables,
  startBulkMutation,
  startBulkQuery,
} from "./operations.server";
import {
  needsRefresh,
  resultUrlExpiresAt,
  type BulkErrorCode,
  type BulkStatus,
} from "./status";

type AdminGraphql = AdminApiContext["graphql"];

/**
 * What a job is for: a catalog CSV export or a Nutrition Data Health audit
 * (same query, different consumer), or a bulk fix (a mutation). New modules
 * add their own kind.
 */
export type BulkJobKind = "catalog" | "audit" | "fix";

/** Fields of a bulk operation that a job mirrors, from GraphQL or the webhook. */
export interface BulkOperationSnapshot {
  status: BulkStatus;
  errorCode?: BulkErrorCode | null;
  objectCount?: number | string | null;
  rootObjectCount?: number | string | null;
  url?: string | null;
  partialDataUrl?: string | null;
  completedAt?: string | Date | null;
}

export async function createBulkJob(
  graphql: AdminGraphql,
  shop: string,
  kind: BulkJobKind,
  query: string,
): Promise<BulkJob> {
  const operation = await startBulkQuery(graphql, query);
  return recordJob(shop, kind, operation);
}

/** Uploads one line of variables per execution, then starts the bulk mutation. */
export async function createBulkMutationJob(
  graphql: AdminGraphql,
  shop: string,
  kind: BulkJobKind,
  mutation: string,
  variablesJsonl: string,
): Promise<BulkJob> {
  const stagedUploadPath = await stageBulkVariables(graphql, variablesJsonl);
  const operation = await startBulkMutation(graphql, mutation, stagedUploadPath);
  return recordJob(shop, kind, operation);
}

function recordJob(shop: string, kind: BulkJobKind, operation: { id: string; status: string }) {
  return prisma.bulkJob.create({
    data: {
      shop,
      kind,
      operationId: operation.id,
      status: operation.status,
    },
  });
}

/** Maps a snapshot to the columns it updates; absent fields stay unchanged. */
export function jobUpdate(snapshot: BulkOperationSnapshot) {
  const completedAt = snapshot.completedAt ? new Date(snapshot.completedAt) : undefined;
  return {
    status: snapshot.status,
    errorCode: snapshot.errorCode ?? null,
    // UnsignedInt64 counts arrive as strings from GraphQL.
    objectCount: snapshot.objectCount != null ? Number(snapshot.objectCount) : undefined,
    rootObjectCount:
      snapshot.rootObjectCount != null ? Number(snapshot.rootObjectCount) : undefined,
    url: snapshot.url ?? undefined,
    partialDataUrl: snapshot.partialDataUrl ?? undefined,
    completedAt,
    urlExpiresAt: completedAt ? resultUrlExpiresAt(completedAt) : undefined,
  };
}

export async function applySnapshot(operationId: string, snapshot: BulkOperationSnapshot) {
  // updateMany: a webhook for an operation this app didn't record is ignored.
  return prisma.bulkJob.updateMany({
    where: { operationId },
    data: jobUpdate(snapshot),
  });
}

/**
 * Polling fallback: refreshes jobs that are running or incomplete. The
 * webhook usually gets there first; this covers missed or delayed deliveries.
 */
export async function refreshStaleJobs(graphql: AdminGraphql, shop: string) {
  const jobs = await prisma.bulkJob.findMany({ where: { shop } });
  await Promise.all(
    jobs.filter(needsRefresh).map(async (job) => {
      const operation = await getBulkOperation(graphql, job.operationId);
      if (operation) {
        await applySnapshot(job.operationId, operation);
      }
    }),
  );
}

/** Also refreshes the URL when it's needed, since GraphQL returns a freshly signed one. */
export async function refreshJob(graphql: AdminGraphql, job: BulkJob): Promise<BulkJob> {
  const operation = await getBulkOperation(graphql, job.operationId);
  if (!operation) return job;
  return prisma.bulkJob.update({ where: { id: job.id }, data: jobUpdate(operation) });
}

export function listBulkJobs(shop: string, kind: BulkJobKind, take = 20) {
  return prisma.bulkJob.findMany({
    where: { shop, kind },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export function latestBulkJob(shop: string, kind: BulkJobKind) {
  return prisma.bulkJob.findFirst({
    where: { shop, kind },
    orderBy: { createdAt: "desc" },
  });
}

export function findBulkJob(shop: string, id: string) {
  return prisma.bulkJob.findFirst({ where: { shop, id } });
}
