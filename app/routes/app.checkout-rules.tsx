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
  if (!rule.functionReady) return <s-badge tone="warning">Function not deployed</s-badge>;
  if (!rule.ownerId) return <s-badge>Not created</s-badge>;
  if (!rule.settings) return <s-badge tone="critical">Invalid settings: rule off</s-badge>;
  return <s-badge tone={rule.active ? "success" : "warning"}>{rule.active ? "Active" : rule.status}</s-badge>;
}

function FormFeedback({ result }: { result: ActionResult | undefined }) {
  if (!result) return null;
  if (result.error) {
    return (
      <s-banner heading="Shopify rejected the change" tone="critical">
        <s-paragraph>{result.error}</s-paragraph>
      </s-banner>
    );
  }
  return result.saved ? <s-banner tone="success" heading="Saved. Checkout uses the new settings now." /> : null;
}

function BundlesBadge({ bundles }: { bundles: BundlesView }) {
  if (!bundles.functionReady) return <s-badge tone="warning">Function not deployed</s-badge>;
  if (!bundles.transformId) return <s-badge>Not created</s-badge>;
  if (bundles.outdated) return <s-badge tone="warning">Needs update</s-badge>;
  return <s-badge tone="success">Active</s-badge>;
}

function BundlesSection({ bundles }: { bundles: BundlesView }) {
  const fetcher = useFetcher<typeof action>();
  const { build } = bundles;
  const problems = fetcher.data?.problems ?? (build.ok ? [] : build.problems);
  const canSave = bundles.functionReady && build.ok && fetcher.state === "idle";

  return (
    <s-section heading="Bundles">
      <fetcher.Form method="post">
        <input type="hidden" name="intent" value="starter-kit" />
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="small-200">
            <BundlesBadge bundles={bundles} />
          </s-stack>
          <s-text color="subdued">
            Cat Starter Kit: the buyer picks a dry food recipe and a treat flavor on the product page, and the cart
            expands the kit into those two products at the kit price. Options and price shares come from the products in
            the store; save again after changing them.
          </s-text>
          {!bundles.eligibleForBundles ? (
            <s-banner heading="This store can't sell bundles" tone="critical" />
          ) : null}
          {problems.length > 0 ? (
            <s-banner heading="Fix these before saving" tone="warning">
              <s-unordered-list>
                {problems.map((problem) => (
                  <s-list-item key={problem}>{problem}</s-list-item>
                ))}
              </s-unordered-list>
            </s-banner>
          ) : null}
          <FormFeedback result={fetcher.data?.problems ? undefined : fetcher.data} />
          {build.ok ? (
            <s-stack direction="block" gap="small-200">
              <s-text>
                Recipes ({build.picker.recipes.length}):{" "}
                {build.picker.recipes.map((option) => option.label).join(", ")}
              </s-text>
              <s-text>
                Treat flavors ({build.picker.treats.length}):{" "}
                {build.picker.treats.map((option) => option.label).join(", ")}
              </s-text>
            </s-stack>
          ) : null}
          <s-button type="submit" variant="primary" {...(!canSave ? { disabled: true } : {})}>
            {bundles.transformId ? "Save" : "Turn on starter kit"}
          </s-button>
        </s-stack>
      </fetcher.Form>
    </s-section>
  );
}

export default function CheckoutRules() {
  const { rules, bundles, error } = useLoaderData<typeof loader>();
  const rewardFetcher = useFetcher<typeof action>();
  const limitFetcher = useFetcher<typeof action>();

  if (!rules || !bundles) {
    return (
      <s-page heading="Checkout rules">
        <s-banner heading="Could not read the checkout rules" tone="critical">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
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
      <s-section heading="Refill reward">
        <rewardFetcher.Form method="post">
          <input type="hidden" name="intent" value="refill-reward" />
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small-200">
              <StatusBadge rule={refillReward} />
            </s-stack>
            <s-text color="subdued">
              Automatic discount on dry food for signed-in retail customers whose Refill Radar run-out date is
              within the window, before or after it. Combines with order and shipping discounts.
            </s-text>
            <FormFeedback result={rewardFetcher.data} />
            <s-number-field
              name="percentage"
              label="Discount"
              suffix="%"
              defaultValue={String(reward.percentage)}
              min={RANGES.percentage.min}
              max={RANGES.percentage.max}
              {...(rewardErrors.percentage ? { error: rewardErrors.percentage } : {})}
            />
            <s-number-field
              name="windowDays"
              label="Window"
              suffix="days"
              defaultValue={String(reward.windowDays)}
              min={RANGES.windowDays.min}
              max={RANGES.windowDays.max}
              {...(rewardErrors.windowDays ? { error: rewardErrors.windowDays } : {})}
            />
            <s-button
              type="submit"
              variant="primary"
              {...(!refillReward.functionReady || rewardFetcher.state !== "idle" ? { disabled: true } : {})}
            >
              {refillReward.ownerId ? "Save" : "Create discount"}
            </s-button>
          </s-stack>
        </rewardFetcher.Form>
      </s-section>

      <s-section heading="Order limit per product">
        <limitFetcher.Form method="post">
          <input type="hidden" name="intent" value="order-limit" />
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small-200">
              <StatusBadge rule={orderLimit} />
            </s-stack>
            <s-text color="subdued">
              Blocks a retail checkout with more units of one product variant than the limit, and points buyers to a
              business account. B2B orders follow their catalog quantity rules instead.
            </s-text>
            <FormFeedback result={limitFetcher.data} />
            <s-number-field
              name="maxPerVariant"
              label="Limit per variant"
              suffix="units"
              defaultValue={String(limit.maxPerVariant)}
              min={RANGES.maxPerVariant.min}
              max={RANGES.maxPerVariant.max}
              {...(limitErrors.maxPerVariant ? { error: limitErrors.maxPerVariant } : {})}
            />
            <s-button
              type="submit"
              variant="primary"
              {...(!orderLimit.functionReady || limitFetcher.state !== "idle" ? { disabled: true } : {})}
            >
              {orderLimit.ownerId ? "Save" : "Create rule"}
            </s-button>
          </s-stack>
        </limitFetcher.Form>
      </s-section>

      <BundlesSection bundles={bundles} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
