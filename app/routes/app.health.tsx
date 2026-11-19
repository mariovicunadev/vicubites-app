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
      <div className="et-actions">
        <a className="et-button" href="/app/health/fix">
          Fix in bulk
        </a>
        <button
          type="button"
          className="et-button et-button--primary"
          onClick={() => fetcher.submit({}, { method: "post" })}
          disabled={running}
        >
          Run audit
        </button>
      </div>

      {error && (
        <div className="et-banner" role="alert">
          <strong>The audit could not be updated</strong>
          {error}
        </div>
      )}
      {audit?.failed && (
        <div className="et-banner" role="alert">
          <strong>The last audit failed</strong>
          Shopify reported {audit.failed}. Run the audit again.
        </div>
      )}
      {running && (
        <div className="et-banner et-banner--info" role="status">
          <strong>Audit in progress</strong>
          Reading the catalog through a bulk operation. Results appear here
          when it finishes.
        </div>
      )}

      {summary.products === 0 ? (
        <div className="et-panel et-empty">
          <h3>No audit yet</h3>
          <p>
            Run an audit to score every product on the completeness of its
            nutrition data.
          </p>
          <button
            type="button"
            className="et-button et-button--primary"
            onClick={() => fetcher.submit({}, { method: "post" })}
            disabled={running}
          >
            Run audit
          </button>
        </div>
      ) : (
        <>
          <section className="et-section" aria-labelledby="health-catalog">
            <h2 id="health-catalog" className="et-section__heading">
              Catalog
            </h2>
            <div className="et-metrics">
              <Metric label="Average score" value={`${summary.averageScore} / 100`} />
              <Metric
                label="Products needing attention"
                value={`${summary.needsAttention} of ${summary.products}`}
              />
              <Metric label="Last audit" value={audit?.completedAt ?? "—"} small />
            </div>
          </section>

          <section className="et-section" aria-labelledby="health-rules">
            <h2 id="health-rules" className="et-section__heading">
              Rules
            </h2>
            <div className="et-panel">
              {summary.rules.map((rule) => (
                <RuleBar key={rule.ruleId} {...rule} />
              ))}
            </div>
          </section>

          <section className="et-section" aria-labelledby="health-products">
            <h2 id="health-products" className="et-section__heading">
              Products
            </h2>
            <div className="et-panel et-table__scroll">
              <ProductsTable rows={rows} />
            </div>
          </section>
        </>
      )}
    </s-page>
  );
}

function Metric({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="et-panel et-metric">
      <div className="et-metric__label">{label}</div>
      <div className={`et-metric__value${small ? " et-metric__value--sm" : ""}`}>
        {value}
      </div>
    </div>
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
  const pct = total > 0 ? Math.round((passing / total) * 100) : 0;
  return (
    <div className="et-rule">
      <div className="et-rule__head">
        <strong>
          {label} · {RULE_WEIGHTS.get(ruleId)} pts
        </strong>
        <span className="muted">
          {passing} of {total} products
        </span>
      </div>
      <div
        className={`et-progress${complete ? " et-progress--success" : ""}`}
        role="progressbar"
        aria-valuenow={passing}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={`${label}: ${passing} of ${total} products pass`}
      >
        <div className="et-progress__bar" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProductsTable({ rows }: { rows: HealthRow[] }) {
  return (
    <table className="et-table">
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Status</th>
          <th scope="col" className="num">
            Score
          </th>
          <th scope="col">Missing</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.productId}>
            <td>
              <a href={`shopify://admin/products/${row.adminId}`} target="_top">
                {row.title}
              </a>
            </td>
            <td>
              <span
                className={`et-badge et-badge--${
                  row.status === "ACTIVE" ? "success" : "neutral"
                }`}
              >
                {row.status}
              </span>
            </td>
            <td className="num">
              <span className={`et-badge et-badge--${row.tone}`}>{row.score}</span>
            </td>
            <td>
              {row.issues.length === 0 ? (
                <span className="issues">Complete</span>
              ) : (
                row.issues.map((issue) => (
                  <span className="issues" key={issue.ruleId}>
                    <strong>{issue.label}:</strong> {issue.missing.join(", ")}
                  </span>
                ))
              )}
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
