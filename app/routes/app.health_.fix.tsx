import { useEffect, useRef, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData, useNavigate, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { refreshStaleJobs } from "../lib/bulk/jobs.server";
import type { FixPlan } from "../lib/fix/plan";
import { countOutcomes, type FixOutcome } from "../lib/fix/results";
import {
  MAX_CSV_BYTES,
  applyFix,
  previewFix,
  processLatestFix,
  toFixRunView,
} from "../lib/fix/run.server";
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
        <s-banner heading="Something went wrong" tone="critical">
          {error}
        </s-banner>
      )}

      <s-section heading="1. Download the spreadsheet">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Products from the latest audit missing guaranteed analysis, calories or
            classification, with their current values. Fill in the blanks with the
            manufacturer&apos;s data; blank cells are left unchanged.
          </s-paragraph>
          <TemplateButton />
        </s-stack>
      </s-section>

      <s-section heading="2. Upload the completed file">
        <s-drop-zone
          ref={dropZone}
          label="Completed spreadsheet (CSV, up to 1 MB)"
          accept=".csv,text/csv"
          {...(preview.state !== "idle" ? { disabled: true } : {})}
        ></s-drop-zone>
      </s-section>

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
    <s-button icon="download" onClick={download} {...(busy ? { loading: true } : {})}>
      Download CSV
    </s-button>
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
      <s-section heading="3. Review">
        <s-banner heading="The file can't be used" tone="critical">
          {plan.fileErrors.join(" ")}
        </s-banner>
      </s-section>
    );
  }

  const count = plan.products.length;
  return (
    <s-section heading="3. Review and apply">
      <s-stack direction="block" gap="base">
        <s-text>
          {count} {count === 1 ? "product" : "products"} will change · {plan.rowErrors.length}{" "}
          skipped · {plan.unchanged} unchanged
        </s-text>

        {plan.rowErrors.length > 0 && (
          <s-banner heading="Rows skipped: nothing is written for them" tone="warning">
            <s-stack direction="block" gap="small-300">
              {plan.rowErrors.map((row) => (
                <s-text key={row.line}>
                  Line {row.line}: {row.messages.join("; ")}
                </s-text>
              ))}
            </s-stack>
          </s-banner>
        )}

        {count > 0 && (
          <>
            <s-table>
              <s-table-header-row>
                <s-table-header>Product</s-table-header>
                <s-table-header>Changes</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {plan.products.map((product) => (
                  <s-table-row key={product.productId}>
                    <s-table-cell>{product.title}</s-table-cell>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-300">
                        {product.changes.map((change) => (
                          <s-text key={change.key}>
                            <s-text type="strong">{change.label}:</s-text> {change.from ?? "—"} →{" "}
                            {change.to}
                          </s-text>
                        ))}
                      </s-stack>
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" onClick={onApply} {...(busy ? { loading: true } : {})}>
                Apply to {count} {count === 1 ? "product" : "products"}
              </s-button>
            </s-stack>
          </>
        )}
      </s-stack>
    </s-section>
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
      <s-section heading="Last fix">
        <s-banner heading="Fix in progress" tone="info">
          Shopify is applying the changes through a bulk operation. Results appear here when it
          finishes.
        </s-banner>
      </s-section>
    );
  }

  const counts = countOutcomes(outcomes);
  return (
    <s-section heading="Last fix">
      <s-stack direction="block" gap="base">
        <s-text>
          {counts.applied} applied · {counts.failed} failed
          {counts.missing > 0 ? ` · ${counts.missing} without a result` : ""}
        </s-text>
        <s-table>
          <s-table-header-row>
            <s-table-header>Product</s-table-header>
            <s-table-header>Result</s-table-header>
            <s-table-header>Details</s-table-header>
          </s-table-header-row>
          <s-table-body>
            {outcomes.map((outcome) => (
              <s-table-row key={outcome.productId}>
                <s-table-cell>
                  <s-link
                    href={`shopify://admin/products/${legacyId(outcome.productId)}`}
                    target="_top"
                  >
                    {outcome.title}
                  </s-link>
                </s-table-cell>
                <s-table-cell>
                  <s-badge tone={outcome.status === "applied" ? "success" : "critical"}>
                    {outcome.status === "applied"
                      ? "Applied"
                      : outcome.status === "failed"
                        ? "Failed"
                        : "No result"}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  {outcome.messages.length > 0 ? (
                    outcome.messages.join("; ")
                  ) : (
                    <s-text color="subdued">—</s-text>
                  )}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table-body>
        </s-table>
        <s-stack direction="inline" gap="base">
          <s-button onClick={onAudit} {...(auditBusy ? { loading: true } : {})}>
            Run audit to update scores
          </s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
