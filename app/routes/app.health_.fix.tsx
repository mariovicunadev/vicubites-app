import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { ScrollRegion } from "../components/et/ScrollRegion";
import { AdminApiError } from "../lib/admin/errors";
import { refreshStaleJobs } from "../lib/bulk/jobs.server";
import { MAX_CSV_BYTES } from "../lib/fix/csv-parse";
import type { FixPlan } from "../lib/fix/plan";
import { countOutcomes, type FixOutcome } from "../lib/fix/results";
import { applyFix, previewFix, processLatestFix, toFixRunView } from "../lib/fix/run.server";
import { legacyId } from "../lib/health/product";
import { authenticate } from "../shopify.server";

const POLL_INTERVAL_MS = 3000;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  let error: string | null = null;
  let run = null;
  try {
    await refreshStaleJobs(admin.graphql, session.shop);
    run = await processLatestFix(admin.graphql, session.shop);
  } catch (caught) {
    if (!(caught instanceof AdminApiError)) throw caught;
    error = caught.message;
  }
  return { error, lastFix: run ? toFixRunView(run) : null };
};

type ActionResult =
  | { ok: true; intent: "preview"; runId: string; plan: FixPlan }
  | { ok: true; intent: "apply" }
  | { ok: false; error: string };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  try {
    if (intent === "preview") {
      const csv = String(form.get("csv") ?? "");
      if (new TextEncoder().encode(csv).length > MAX_CSV_BYTES) {
        return { ok: false, error: "The file is larger than 1 MB." };
      }
      const { runId, plan } = await previewFix(admin.graphql, session.shop, csv);
      return { ok: true, intent, runId, plan };
    }
    if (intent === "apply") {
      await applyFix(admin.graphql, session.shop, String(form.get("runId")));
      return { ok: true, intent };
    }
    return { ok: false, error: "Unknown action." };
  } catch (error) {
    // Thrown Responses are re-authentication redirects: let them through.
    if (error instanceof Response) throw error;
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

export default function BulkFix() {
  const { lastFix, error: loadError } = useLoaderData<typeof loader>();
  const preview = useFetcher<typeof action>();
  const apply = useFetcher<typeof action>();
  const audit = useFetcher();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const dropZone = useRef<HTMLElementTagNameMap["s-drop-zone"]>(null);

  const previewData = preview.data?.ok && preview.data.intent === "preview" ? preview.data : null;
  // Once applied, the preview gives way to the results of that fix.
  const applied = Boolean(apply.data?.ok);
  const error =
    (preview.data && !preview.data.ok ? preview.data.error : null) ??
    (apply.data && !apply.data.ok ? apply.data.error : null) ??
    loadError;

  useEffect(() => {
    const element = dropZone.current;
    if (!element) return;
    const onChange = async () => {
      const file = element.files[0];
      if (!file) return;
      if (file.size > MAX_CSV_BYTES) {
        shopify.toast.show("The file is larger than 1 MB.", { isError: true });
        return;
      }
      preview.submit({ intent: "preview", csv: await file.text() }, { method: "post" });
    };
    element.addEventListener("change", onChange);
    return () => element.removeEventListener("change", onChange);
  }, [preview, shopify]);

  useEffect(() => {
    if (!lastFix?.running) return;
    const timer = setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [lastFix?.running, revalidator]);

  useEffect(() => {
    if (audit.state === "idle" && audit.data) navigate("/app/health");
  }, [audit.state, audit.data, navigate]);

  return (
    <s-page heading="Fix nutrition data in bulk">
      <s-link slot="breadcrumb-actions" href="/app/health">
        Data health
      </s-link>

      {error && (
        <div className="et-banner" role="alert">
          <strong>Something went wrong</strong>
          {error}
        </div>
      )}

      <section className="et-section" aria-labelledby="fix-template">
        <h2 id="fix-template" className="et-section__heading">
          1. Download the spreadsheet
        </h2>
        <div className="et-panel et-copy">
          <p>
            Products from the latest audit missing guaranteed analysis, calories or
            classification, with their current values. Fill in the blanks with the
            manufacturer&apos;s data; blank cells are left unchanged.
          </p>
          <div className="et-banner et-banner--info">
            <strong>This is not a full catalog export</strong>
            The file only includes products with failures this spreadsheet can fix (guaranteed
            analysis, calories or classification) in the latest audit.
          </div>
          <TemplateButton />
        </div>
      </section>

      <section className="et-section" aria-labelledby="fix-upload">
        <h2 id="fix-upload" className="et-section__heading">
          2. Upload the completed file
        </h2>
        <div className="et-panel et-copy">
          <s-drop-zone
            ref={dropZone}
            label="Completed spreadsheet (CSV, up to 1 MB)"
            accept=".csv,text/csv"
            {...(preview.state !== "idle" ? { disabled: true } : {})}
          ></s-drop-zone>
        </div>
      </section>

      {previewData && !applied && (
        <ReviewSection
          plan={previewData.plan}
          busy={apply.state !== "idle"}
          onApply={() => apply.submit({ intent: "apply", runId: previewData.runId }, { method: "post" })}
        />
      )}

      {lastFix?.outcomes || lastFix?.running ? (
        <ResultsSection
          running={lastFix.running}
          outcomes={lastFix.outcomes}
          auditBusy={audit.state !== "idle"}
          onAudit={() => audit.submit({}, { method: "post", action: "/app/health" })}
        />
      ) : null}
    </s-page>
  );
}

function TemplateButton() {
  const shopify = useAppBridge();
  const [busy, setBusy] = useState(false);

  // App Bridge adds the session token to same-origin fetches, which a plain
  // link inside the admin iframe wouldn't carry.
  const download = async () => {
    setBusy(true);
    try {
      const response = await fetch("/app/health/fix/template");
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const name =
        /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ??
        "nutrition-gaps.csv";
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
      className="et-button"
      onClick={download}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? "Downloading…" : "Download CSV"}
    </button>
  );
}

function ReviewSection({
  plan,
  busy,
  onApply,
}: {
  plan: FixPlan;
  busy: boolean;
  onApply: () => void;
}) {
  if (plan.fileErrors.length > 0) {
    return (
      <section className="et-section" aria-labelledby="fix-review">
        <h2 id="fix-review" className="et-section__heading">
          3. Review
        </h2>
        <div className="et-banner" role="alert">
          <strong>The file can&apos;t be used</strong>
          {plan.fileErrors.join(" ")}
        </div>
      </section>
    );
  }

  const count = plan.products.length;
  return (
    <section className="et-section" aria-labelledby="fix-review">
      <h2 id="fix-review" className="et-section__heading">
        3. Review and apply
      </h2>
      <div className="et-panel et-copy">
        <p>
          <strong>
            {count} {count === 1 ? "product" : "products"} will change ·{" "}
            {plan.rowErrors.length} skipped · {plan.unchanged} unchanged
          </strong>
        </p>

        {plan.rowErrors.length > 0 && (
          <div className="et-banner et-banner--warning" role="alert">
            <strong>Rows skipped: nothing is written for them</strong>
            <ul>
              {plan.rowErrors.map((row) => (
                <li key={row.line}>
                  Line {row.line}: {row.messages.join("; ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {count > 0 && (
          <>
            <ScrollRegion label="Products to change">
              <table className="et-table">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.products.map((product) => (
                    <tr key={product.productId}>
                      <td className="nowrap">{product.title}</td>
                      <td>
                        {product.changes.map((change) => (
                          <span className="issues" key={change.key}>
                            <strong>{change.label}:</strong> {change.from ?? "—"} → {change.to}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p>
              <button
                type="button"
                className="et-button et-button--primary"
                onClick={onApply}
                disabled={busy}
                aria-busy={busy}
              >
                Apply to {count} {count === 1 ? "product" : "products"}
              </button>
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function ResultsSection({
  running,
  outcomes,
  auditBusy,
  onAudit,
}: {
  running: boolean;
  outcomes: FixOutcome[] | null;
  auditBusy: boolean;
  onAudit: () => void;
}) {
  if (running || !outcomes) {
    return (
      <section className="et-section" aria-labelledby="fix-results">
        <h2 id="fix-results" className="et-section__heading">
          Last fix
        </h2>
        <div className="et-banner et-banner--info" role="status">
          <strong>Fix in progress</strong>
          Shopify is applying the changes through a bulk operation. Results appear here when
          it finishes.
        </div>
      </section>
    );
  }

  const counts = countOutcomes(outcomes);
  return (
    <section className="et-section" aria-labelledby="fix-results">
      <h2 id="fix-results" className="et-section__heading">
        Last fix
      </h2>
      <div className="et-panel et-copy">
        <p>
          <strong>
            {counts.applied} applied · {counts.failed} failed
            {counts.missing > 0 ? ` · ${counts.missing} without a result` : ""}
          </strong>
        </p>
        <ScrollRegion label="Bulk fix results">
          <table className="et-table">
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Result</th>
                <th scope="col">Details</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((outcome) => (
                <tr key={outcome.productId}>
                  <td>
                    <a
                      href={`shopify://admin/products/${legacyId(outcome.productId)}`}
                      target="_top"
                    >
                      {outcome.title}
                    </a>
                  </td>
                  <td>
                    <span
                      className={`et-badge et-badge--${outcome.status === "applied" ? "success" : "critical"}`}
                    >
                      {outcome.status === "applied"
                        ? "Applied"
                        : outcome.status === "failed"
                          ? "Failed"
                          : "No result"}
                    </span>
                  </td>
                  <td>
                    {outcome.messages.length > 0 ? (
                      outcome.messages.join("; ")
                    ) : (
                      <span className="issues">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p>
          <button
            type="button"
            className="et-button"
            onClick={onAudit}
            disabled={auditBusy}
            aria-busy={auditBusy}
          >
            Run audit to update scores
          </button>
        </p>
      </div>
    </section>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
