import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

/** `GET /api/health/:productId` response (see `app/routes/api.health.$productId.tsx`). */
interface ProductHealth {
  score: number;
  tone: "success" | "caution" | "critical";
  issues: { ruleId: string; label: string; missing: string[] }[];
  checkedAt: string;
}

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; health: ProductHealth };

/** `gid://shopify/Product/123` → `123`. */
function numericId(gid: string): string {
  return gid.slice(gid.lastIndexOf("/") + 1);
}

async function fetchHealth(productId: string): Promise<ProductHealth> {
  // Relative URLs resolve against the app URL, and the admin adds an ID token
  // in the Authorization header.
  const response = await fetch(`/api/health/${numericId(productId)}`);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: string } | null)?.error;
    throw new Error(error ?? `The app responded ${response.status}`);
  }
  return body as ProductHealth;
}

function Extension() {
  const productId = shopify.data.selected[0]?.id;
  const [state, setState] = useState<State>({ kind: "loading" });

  const check = () => {
    if (!productId) return;
    setState({ kind: "loading" });
    fetchHealth(productId).then(
      (health) => setState({ kind: "ready", health }),
      (error: unknown) =>
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
    );
  };

  useEffect(check, [productId]);

  const summary =
    state.kind === "ready"
      ? `${state.health.score} / 100 · ${
          state.health.issues.length === 0 ? "complete" : `${state.health.issues.length} to fix`
        }`
      : undefined;

  return (
    <s-admin-block heading="Nutrition data health" collapsedSummary={summary}>
      <s-stack direction="block" gap="base">
        {state.kind === "loading" && <s-spinner accessibilityLabel="Checking nutrition data" />}

        {state.kind === "error" && (
          <s-banner heading="The score could not be checked" tone="critical">
            <s-paragraph>{state.message}</s-paragraph>
            <s-button slot="secondary-actions" onClick={check}>
              Try again
            </s-button>
          </s-banner>
        )}

        {state.kind === "ready" && <HealthDetails health={state.health} />}

        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button onClick={check} disabled={state.kind === "loading"}>
            Check again
          </s-button>
          <s-link href="app:app/health">Open Data health</s-link>
        </s-stack>
      </s-stack>
    </s-admin-block>
  );
}

function HealthDetails({ health }: { health: ProductHealth }) {
  return (
    <s-stack direction="block" gap="base">
      <s-stack direction="inline" gap="small-200" alignItems="center">
        <s-badge tone={health.tone}>{`${health.score} / 100`}</s-badge>
        <s-text color="subdued">
          {`Checked ${new Date(health.checkedAt).toLocaleTimeString()} from the last save`}
        </s-text>
      </s-stack>

      {health.issues.length === 0 ? (
        <s-text>Every nutrition data rule passes.</s-text>
      ) : (
        <s-unordered-list>
          {health.issues.map((issue) => (
            <s-list-item key={issue.ruleId}>
              <s-text type="strong">{issue.label}</s-text>
              {`: ${issue.missing.join(", ")}`}
            </s-list-item>
          ))}
        </s-unordered-list>
      )}
    </s-stack>
  );
}
