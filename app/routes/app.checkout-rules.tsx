import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { loadBundles, saveStarterKit, type BundlesView } from "../lib/bundles/bundles.server";
import type { RuleView } from "../lib/checkout-rules/overview";
import { loadCheckoutRules, saveOrderLimit, saveRefillReward } from "../lib/checkout-rules/rules.server";
import {
  DEFAULT_ORDER_LIMIT,
  DEFAULT_REFILL_REWARD,
  RANGES,
  validateOrderLimitForm,
  validateRefillRewardForm,
} from "../lib/checkout-rules/settings";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  try {
    const [rules, bundles] = await Promise.all([loadCheckoutRules(admin.graphql), loadBundles(admin.graphql)]);
    return { error: null, rules, bundles };
  } catch (error) {
    if (error instanceof AdminApiError) return { error: error.message, rules: null, bundles: null };
    throw error;
  }
};

type FieldErrors = Partial<Record<string, string>>;
type ActionResult = { saved: boolean; error: string | null; fieldErrors: FieldErrors; problems?: string[] };

export const action = async ({ request }: ActionFunctionArgs): Promise<ActionResult> => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  // The owner ID comes from a fresh read, never from the form.
  try {
    if (intent === "starter-kit") {
      // Built on the server from the store's products: the form sends nothing else.
      const problems = await saveStarterKit(admin.graphql);
      return problems
        ? { saved: false, error: null, fieldErrors: {}, problems }
        : { saved: true, error: null, fieldErrors: {} };
    }
    const rules = await loadCheckoutRules(admin.graphql);
    if (intent === "refill-reward") {
      const result = validateRefillRewardForm(form);
      if (!result.ok) return { saved: false, error: null, fieldErrors: result.fieldErrors };
      await saveRefillReward(admin.graphql, rules.refillReward.ownerId, result.value);
    } else if (intent === "order-limit") {
      const result = validateOrderLimitForm(form);
      if (!result.ok) return { saved: false, error: null, fieldErrors: result.fieldErrors };
      await saveOrderLimit(admin.graphql, rules.orderLimit.ownerId, result.value);
    } else {
      return { saved: false, error: "Unknown form.", fieldErrors: {} };
    }
    return { saved: true, error: null, fieldErrors: {} };
  } catch (error) {
    if (error instanceof AdminApiError) return { saved: false, error: error.message, fieldErrors: {} };
    throw error;
  }
};

function StatusBadge({ rule }: { rule: RuleView<unknown> }) {
  if (!rule.functionReady) return <span className="et-badge et-badge--caution">Function not deployed</span>;
  if (!rule.ownerId) return <span className="et-badge et-badge--neutral">Not created</span>;
  if (!rule.settings) return <span className="et-badge et-badge--critical">Invalid settings: rule off</span>;
  return (
    <span className={`et-badge et-badge--${rule.active ? "success" : "caution"}`}>
      {rule.active ? "Active" : rule.status}
    </span>
  );
}

function FormFeedback({ result }: { result: ActionResult | undefined }) {
  if (!result) return null;
  if (result.error) {
    return (
      <div className="et-banner" role="alert">
        <strong>Shopify rejected the change</strong>
        {result.error}
      </div>
    );
  }
  return result.saved ? (
    <div className="et-banner et-banner--success" role="status">
      <strong>Saved. Checkout uses the new settings now.</strong>
    </div>
  ) : null;
}

function NumberField({
  name,
  label,
  suffix,
  defaultValue,
  min,
  max,
  error,
}: {
  name: string;
  label: string;
  suffix: string;
  defaultValue: string;
  min: number;
  max: number;
  error?: string;
}) {
  const errorId = `${name}-error`;
  const suffixId = `${name}-suffix`;
  return (
    <div className="et-field">
      <label htmlFor={name}>{label}</label>
      <div className="et-field__control">
        <input
          className="et-input"
          type="number"
          id={name}
          name={name}
          defaultValue={defaultValue}
          min={min}
          max={max}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${suffixId} ${errorId}` : suffixId}
        />
        <span className="et-field__suffix" id={suffixId}>{suffix}</span>
      </div>
      {error ? (
        <span className="et-field__error" id={errorId} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function BundlesBadge({ bundles }: { bundles: BundlesView }) {
  if (!bundles.functionReady) return <span className="et-badge et-badge--caution">Function not deployed</span>;
  if (!bundles.transformId) return <span className="et-badge et-badge--neutral">Not created</span>;
  if (bundles.outdated) return <span className="et-badge et-badge--caution">Needs update</span>;
  return <span className="et-badge et-badge--success">Active</span>;
}

function BundlesSection({ bundles }: { bundles: BundlesView }) {
  const fetcher = useFetcher<typeof action>();
  const { build } = bundles;
  const problems = fetcher.data?.problems ?? (build.ok ? [] : build.problems);
  const canSave = bundles.functionReady && build.ok && fetcher.state === "idle";

  return (
    <section className="et-section" aria-labelledby="rules-bundles">
      <h2 id="rules-bundles" className="et-section__heading">
        Bundles
      </h2>
      <div className="et-panel et-copy et-rule-card">
        <fetcher.Form method="post" className="et-form" aria-busy={fetcher.state !== "idle"}>
          <input type="hidden" name="intent" value="starter-kit" />
          <div className="et-inline">
            <BundlesBadge bundles={bundles} />
          </div>
          <p className="muted">
            Cat Starter Kit: the buyer picks a dry food recipe and a treat flavor on the product page, and the cart
            expands the kit into those two products at the kit price. Options and price shares come from the products in
            the store; save again after changing them.
          </p>
          {!bundles.eligibleForBundles ? (
            <div className="et-banner" role="alert">
              <strong>This store can&apos;t sell bundles</strong>
            </div>
          ) : null}
          {problems.length > 0 ? (
            <div className="et-banner et-banner--warning" role="alert">
              <strong>Fix these before saving</strong>
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <FormFeedback result={fetcher.data?.problems ? undefined : fetcher.data} />
          {build.ok ? (
            <div>
              <p>
                Recipes ({build.picker.recipes.length}):{" "}
                {build.picker.recipes.map((option) => option.label).join(", ")}
              </p>
              <p>
                Treat flavors ({build.picker.treats.length}):{" "}
                {build.picker.treats.map((option) => option.label).join(", ")}
              </p>
            </div>
          ) : null}
          <div>
            <button type="submit" className="et-button et-button--compact et-button--primary" disabled={!canSave}>
              {bundles.transformId ? "Save" : "Turn on starter kit"}
            </button>
          </div>
        </fetcher.Form>
      </div>
    </section>
  );
}

export default function CheckoutRules() {
  const { rules, bundles, error } = useLoaderData<typeof loader>();
  const rewardFetcher = useFetcher<typeof action>();
  const limitFetcher = useFetcher<typeof action>();

  if (!rules || !bundles) {
    return (
      <s-page heading="Checkout rules">
        <div className="et-banner" role="alert">
          <strong>Could not read the checkout rules</strong>
          {error}
        </div>
      </s-page>
    );
  }

  const { refillReward, orderLimit } = rules;
  const reward = refillReward.settings ?? DEFAULT_REFILL_REWARD;
  const limit = orderLimit.settings ?? DEFAULT_ORDER_LIMIT;
  const rewardErrors = rewardFetcher.data?.fieldErrors ?? {};
  const limitErrors = limitFetcher.data?.fieldErrors ?? {};

  return (
    <s-page heading="Checkout rules">
      <section className="et-section" aria-labelledby="rules-reward">
        <h2 id="rules-reward" className="et-section__heading">
          Refill reward
        </h2>
        <div className="et-panel et-copy et-rule-card">
          <rewardFetcher.Form method="post" className="et-form" aria-busy={rewardFetcher.state !== "idle"}>
            <input type="hidden" name="intent" value="refill-reward" />
            <div className="et-inline">
              <StatusBadge rule={refillReward} />
            </div>
            <p className="muted">
              Automatic discount on dry food for signed-in retail customers whose Refill Radar run-out date is
              within the window, before or after it. Combines with order and shipping discounts.
            </p>
            <FormFeedback result={rewardFetcher.data} />
            <div className="et-fields-row">
              <NumberField
                name="percentage"
                label="Discount"
                suffix="%"
                defaultValue={String(reward.percentage)}
                min={RANGES.percentage.min}
                max={RANGES.percentage.max}
                error={rewardErrors.percentage}
              />
              <NumberField
                name="windowDays"
                label="Window"
                suffix="days"
                defaultValue={String(reward.windowDays)}
                min={RANGES.windowDays.min}
                max={RANGES.windowDays.max}
                error={rewardErrors.windowDays}
              />
            </div>
            <div>
              <button
                type="submit"
                className="et-button et-button--compact et-button--primary"
                disabled={!refillReward.functionReady || rewardFetcher.state !== "idle"}
              >
                {refillReward.ownerId ? "Save" : "Create discount"}
              </button>
            </div>
          </rewardFetcher.Form>
        </div>
      </section>

      <section className="et-section" aria-labelledby="rules-limit">
        <h2 id="rules-limit" className="et-section__heading">
          Order limit per product
        </h2>
        <div className="et-panel et-copy et-rule-card">
          <limitFetcher.Form method="post" className="et-form" aria-busy={limitFetcher.state !== "idle"}>
            <input type="hidden" name="intent" value="order-limit" />
            <div className="et-inline">
              <StatusBadge rule={orderLimit} />
            </div>
            <p className="muted">
              Blocks a retail checkout with more units of one product variant than the limit, and points buyers to a
              business account. B2B orders follow their catalog quantity rules instead.
            </p>
            <FormFeedback result={limitFetcher.data} />
            <NumberField
              name="maxPerVariant"
              label="Limit per variant"
              suffix="units"
              defaultValue={String(limit.maxPerVariant)}
              min={RANGES.maxPerVariant.min}
              max={RANGES.maxPerVariant.max}
              error={limitErrors.maxPerVariant}
            />
            <div>
              <button
                type="submit"
                className="et-button et-button--compact et-button--primary"
                disabled={!orderLimit.functionReady || limitFetcher.state !== "idle"}
              >
                {orderLimit.ownerId ? "Save" : "Create rule"}
              </button>
            </div>
          </limitFetcher.Form>
        </div>
      </section>

      <BundlesSection bundles={bundles} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
