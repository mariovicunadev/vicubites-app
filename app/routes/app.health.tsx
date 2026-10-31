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
import { loadHealthResults, processLatestAudit, startAudit } from "../lib/health/audit.server";
import { RULES } from "../lib/health/rules";
import { summarize } from "../lib/health/score";
import { toHealthRow, type HealthRow } from "../lib/health/view";
import { authenticate } from "../shopify.server";

const POLL_INTERVAL_MS = 3000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  let error: string | null = null;
  let audit = null;
  try {
    await refreshStaleJobs(admin.graphql, session.shop);
    audit = await processLatestAudit(admin.graphql, session.shop);
  } catch (caught) {
    if (!(caught instanceof AdminApiError)) throw caught;
    error = caught.message;
  }

  const results = await loadHealthResults(session.shop);
  const auditView = audit ? toJobView(audit) : null;
  return {
    error,
    audit: auditView && {
      running: auditView.running || (audit?.status === "COMPLETED" && !audit.processedAt),
      failed: audit?.status === "FAILED" ? (auditView.errorCode ?? "FAILED") : null,
      completedAt: auditView.completedAt,
    },
    summary: summarize(results),
    rows: results.map(toHealthRow),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  try {
    await startAudit(admin.graphql, session.shop);
    return { error: null };
  } catch (error) {
    if (error instanceof AdminApiError) return { error: error.message };
    throw error;
  }
};

export default function DataHealth() {
  const { audit, summary, rows, error: loadError } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const running = fetcher.state !== "idle" || Boolean(audit?.running);
  const error = fetcher.data?.error ?? loadError;

  useEffect(() => {
    if (!audit?.running) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [audit?.running, revalidator]);

  return (
    <s-page heading="Data health">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => fetcher.submit({}, { method: "post" })}
        {...(running ? { disabled: true } : {})}
      >
        Run audit
      </s-button>

      {error && (
        <s-banner heading="The audit could not be updated" tone="critical">
          {error}
        </s-banner>
      )}
      {audit?.failed && (
        <s-banner heading="The last audit failed" tone="critical">
          Shopify reported {audit.failed}. Run the audit again.
        </s-banner>
      )}
      {running && (
        <s-banner heading="Audit in progress" tone="info">
          Reading the catalog through a bulk operation. Results appear here when it finishes.
        </s-banner>
      )}

      {summary.products === 0 ? (
        <s-section>
          <s-empty-state heading="No audit yet">
            <s-paragraph>
              Run an audit to score every product on the completeness of its nutrition data.
            </s-paragraph>
          </s-empty-state>
        </s-section>
      ) : (
        <>
          <s-section heading="Catalog">
            <s-grid gridTemplateColumns="1fr 1fr 1fr" gap="base">
              <Metric label="Average score" value={`${summary.averageScore} / 100`} />
              <Metric
                label="Products needing attention"
                value={`${summary.needsAttention} of ${summary.products}`}
              />
              <Metric label="Last audit" value={audit?.completedAt ?? "—"} />
            </s-grid>
          </s-section>

          <s-section heading="Rules">
            <s-stack direction="block" gap="base">
              {summary.rules.map((rule) => (
                <RuleBar key={rule.ruleId} {...rule} />
              ))}
            </s-stack>
          </s-section>

          <s-section heading="Products">
            <ProductsTable rows={rows} />
          </s-section>
        </>
      )}
    </s-page>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
      </s-stack>
    </s-box>
  );
}

const RULE_WEIGHTS = new Map<string, number>(RULES.map((rule) => [rule.id, rule.weight]));

function RuleBar({
  ruleId,
  label,
  passing,
  total,
}: {
  ruleId: string;
  label: string;
  passing: number;
  total: number;
}) {
  const complete = passing === total;
  return (
    <s-stack direction="block" gap="small-300">
      <s-stack direction="inline" gap="small-200" justifyContent="space-between">
        <s-text type="strong">
          {label} · {RULE_WEIGHTS.get(ruleId)} pts
        </s-text>
        <s-text color="subdued">
          {passing} of {total} products
        </s-text>
      </s-stack>
      <s-progress
        value={passing}
        max={total}
        tone={complete ? "success" : "caution"}
        accessibilityLabel={`${label}: ${passing} of ${total} products pass`}
      ></s-progress>
    </s-stack>
  );
}

function ProductsTable({ rows }: { rows: HealthRow[] }) {
  return (
    <s-table>
      <s-table-header-row>
        <s-table-header>Product</s-table-header>
        <s-table-header>Status</s-table-header>
        <s-table-header format="numeric">Score</s-table-header>
        <s-table-header>Missing</s-table-header>
      </s-table-header-row>
      <s-table-body>
        {rows.map((row) => (
          <s-table-row key={row.productId}>
            <s-table-cell>
              <s-link href={`shopify://admin/products/${row.adminId}`} target="_top">
                {row.title}
              </s-link>
            </s-table-cell>
            <s-table-cell>
              <s-badge tone={row.status === "ACTIVE" ? "success" : "neutral"}>
                {row.status}
              </s-badge>
            </s-table-cell>
            <s-table-cell>
              <s-badge tone={row.tone}>{row.score}</s-badge>
            </s-table-cell>
            <s-table-cell>
              {row.issues.length === 0 ? (
                <s-text color="subdued">Complete</s-text>
              ) : (
                <s-stack direction="block" gap="small-300">
                  {row.issues.map((issue) => (
                    <s-text key={issue.ruleId}>
                      <s-text type="strong">{issue.label}:</s-text> {issue.missing.join(", ")}
                    </s-text>
                  ))}
                </s-stack>
              )}
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
