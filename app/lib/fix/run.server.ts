import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import type { FixRun } from "@prisma/client";

import prisma from "../../db.server";
import { adminGraphql } from "../admin/graphql.server";
import { createBulkMutationJob, refreshJob } from "../bulk/jobs.server";
import { downloadBulkRecords } from "../bulk/operations.server";
import { isTerminal, type BulkStatus } from "../bulk/status";
import type { RuleResult } from "../health/score";
import { csvRecords } from "./csv-parse";
import { FIXABLE_RULES, FIX_FIELDS } from "./fields";
import { FIX_METAFIELDS_MUTATION, fixVariablesJsonl } from "./jsonl";
import { planFix, type CurrentProduct, type FixPlan } from "./plan";
import { joinFixResults, type FixOutcome } from "./results";

type AdminGraphql = AdminApiContext["graphql"];

/** Uploads larger than this are rejected before parsing. */
export const MAX_CSV_BYTES = 1024 * 1024;
/** `nodes(ids:)` accepts up to 250 IDs per call. */
const NODES_PER_QUERY = 250;

const FIX_CURRENT_PRODUCTS_QUERY = `#graphql
  query fixCurrentProducts($ids: [ID!]!, $keys: [String!]) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        metafields(first: 20, keys: $keys) {
          nodes {
            namespace
            key
            value
          }
        }
      }
    }
  }
`;

const FIX_CHOICES_QUERY = `#graphql
  query fixChoiceDefinitions {
    metafieldDefinitions(first: 50, ownerType: PRODUCT, namespace: "custom") {
      nodes {
        namespace
        key
        validations {
          name
          value
        }
      }
    }
  }
`;

export async function loadCurrentProducts(
  graphql: AdminGraphql,
  ids: readonly string[],
): Promise<Map<string, CurrentProduct & { handle: string }>> {
  const products = new Map<string, CurrentProduct & { handle: string }>();
  const productIds = [...new Set(ids)].filter((id) => id.startsWith("gid://shopify/Product/"));
  for (let start = 0; start < productIds.length; start += NODES_PER_QUERY) {
    const { nodes } = await adminGraphql(graphql, FIX_CURRENT_PRODUCTS_QUERY, {
      variables: {
        ids: productIds.slice(start, start + NODES_PER_QUERY),
        keys: FIX_FIELDS.map((field) => field.key),
      },
    });
    for (const node of nodes) {
      if (!node || !("id" in node)) continue;
      products.set(node.id, {
        id: node.id,
        title: node.title,
        handle: node.handle,
        metafields: Object.fromEntries(
          node.metafields.nodes.map((m) => [`${m.namespace}.${m.key}`, m.value]),
        ),
      });
    }
  }
  return products;
}

/** Allowed values of choice fields, read from the store instead of hard-coded. */
export async function loadChoices(graphql: AdminGraphql): Promise<Map<string, string[]>> {
  const { metafieldDefinitions } = await adminGraphql(graphql, FIX_CHOICES_QUERY);
  const choices = new Map<string, string[]>();
  for (const definition of metafieldDefinitions.nodes) {
    const validation = definition.validations.find((v) => v.name === "choices");
    if (!validation?.value) continue;
    const values: unknown = JSON.parse(validation.value);
    if (Array.isArray(values)) {
      choices.set(`${definition.namespace}.${definition.key}`, values.map(String));
    }
  }
  return choices;
}

/** Products from the latest audit that fail a rule a bulk fix can address. */
export async function templateProducts(graphql: AdminGraphql, shop: string) {
  const rows = await prisma.productHealth.findMany({ where: { shop }, orderBy: { title: "asc" } });
  const ids = rows
    .filter((row) =>
      (JSON.parse(row.results) as RuleResult[]).some(
        (result) => !result.passed && FIXABLE_RULES.has(result.ruleId),
      ),
    )
    .map((row) => row.productId);
  const current = await loadCurrentProducts(graphql, ids);
  return ids.flatMap((id) => current.get(id) ?? []);
}

/**
 * Validates an uploaded CSV against the products' current values and the
 * store's definitions, and saves the plan so "apply" runs exactly what was
 * reviewed. Nothing is written to the store here.
 */
export async function previewFix(graphql: AdminGraphql, shop: string, csv: string) {
  const { columns, records } = csvRecords(csv);
  const [current, choices] = await Promise.all([
    loadCurrentProducts(
      graphql,
      records.map((record) => record.values.product_id ?? ""),
    ),
    loadChoices(graphql),
  ]);
  const plan = planFix({ columns, records, current, choices });

  // Drafts that were never applied are replaced by the new preview.
  await prisma.fixRun.deleteMany({ where: { shop, jobId: null } });
  const run = await prisma.fixRun.create({ data: { shop, plan: JSON.stringify(plan) } });
  return { runId: run.id, plan };
}

export class FixInProgressError extends Error {
  constructor() {
    super("A bulk fix is already running. Wait for it to finish.");
    this.name = "FixInProgressError";
  }
}

/** Runs a reviewed plan as a bulk mutation. One fix at a time per shop. */
export async function applyFix(graphql: AdminGraphql, shop: string, runId: string) {
  const run = await prisma.fixRun.findFirst({ where: { id: runId, shop, jobId: null } });
  if (!run) throw new Error("This preview was already applied or replaced. Upload the file again.");

  const running = await prisma.bulkJob.findFirst({
    where: { shop, kind: "fix", status: { in: ["CREATED", "RUNNING", "CANCELING"] } },
  });
  if (running) throw new FixInProgressError();

  const plan = JSON.parse(run.plan) as FixPlan;
  if (plan.products.length === 0) throw new Error("There is nothing to apply.");

  const job = await createBulkMutationJob(
    graphql,
    shop,
    "fix",
    FIX_METAFIELDS_MUTATION,
    fixVariablesJsonl(plan.products),
  );
  return prisma.fixRun.update({ where: { id: run.id }, data: { jobId: job.id } });
}

/**
 * Reads the result of the latest applied fix once its operation has finished.
 * Claimed through `BulkJob.processedAt`, like audits, so it runs once.
 */
export async function processLatestFix(graphql: AdminGraphql, shop: string) {
  const run = await prisma.fixRun.findFirst({
    where: { shop, jobId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });
  let job = run?.job;
  if (!run || !job || job.processedAt || !isTerminal(job.status as BulkStatus)) return run;
  if (!job.url && !job.partialDataUrl) job = await refreshJob(graphql, job);

  const claimed = await prisma.bulkJob.updateMany({
    where: { id: job.id, processedAt: null },
    data: { processedAt: new Date() },
  });
  if (claimed.count === 0) return run;

  try {
    const url = job.url ?? job.partialDataUrl;
    const records = url ? await downloadBulkRecords(url) : [];
    const plan = JSON.parse(run.plan) as FixPlan;
    const outcomes = joinFixResults(plan.products, records);
    await prisma.fixRun.update({
      where: { id: run.id },
      data: { results: JSON.stringify(outcomes) },
    });
  } catch (error) {
    await prisma.bulkJob.update({ where: { id: job.id }, data: { processedAt: null } });
    throw error;
  }
  return prisma.fixRun.findUnique({ where: { id: run.id }, include: { job: true } });
}

export interface FixRunView {
  id: string;
  status: string;
  running: boolean;
  plan: FixPlan;
  outcomes: FixOutcome[] | null;
}

export function toFixRunView(run: FixRun & { job: { status: string } | null }): FixRunView {
  const status = run.job?.status ?? "DRAFT";
  return {
    id: run.id,
    status,
    running: run.job ? !isTerminal(status as BulkStatus) || run.results === null : false,
    plan: JSON.parse(run.plan) as FixPlan,
    outcomes: run.results ? (JSON.parse(run.results) as FixOutcome[]) : null,
  };
}
