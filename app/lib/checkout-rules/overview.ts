import type { CheckoutRulesOverviewQuery } from "../../types/admin.generated";
import {
  readOrderLimitSettings,
  readRefillRewardSettings,
  type OrderLimitSettings,
  type RefillRewardSettings,
} from "./settings";

/** One checkout rule as the page shows it. */
export interface RuleView<T> {
  /** `false` when the Function isn't deployed to this store yet. */
  functionReady: boolean;
  /** Metafield owner (discount node or validation); `null` until created. */
  ownerId: string | null;
  title: string | null;
  active: boolean;
  /** Shopify's own status word, e.g. `ACTIVE`, `EXPIRED`, `Off`. */
  status: string | null;
  /** `null` when missing or invalid: the Function then does nothing. */
  settings: T | null;
}

export interface CheckoutRulesView {
  refillReward: RuleView<RefillRewardSettings>;
  orderLimit: RuleView<OrderLimitSettings>;
}

const missing = (functionReady: boolean) => ({
  functionReady,
  ownerId: null,
  title: null,
  active: false,
  status: null,
  settings: null,
});

/**
 * Finds this app's instances by Function ID. With more than one instance of
 * a Function, the first active one wins (then the first one listed).
 */
export function toCheckoutRulesView(
  data: CheckoutRulesOverviewQuery,
  handles: { refillReward: string; orderLimit: string },
): CheckoutRulesView {
  const functionId = (handle: string) => data.shopifyFunctions.nodes.find((fn) => fn.handle === handle)?.id ?? null;
  const refillRewardId = functionId(handles.refillReward);
  const orderLimitId = functionId(handles.orderLimit);

  const discounts = data.discountNodes.nodes.flatMap((node) =>
    node.discount.__typename === "DiscountAutomaticApp" &&
    node.discount.appDiscountType.functionId === refillRewardId
      ? [{ id: node.id, discount: node.discount, config: node.config?.jsonValue }]
      : [],
  );
  const discount = discounts.find((d) => d.discount.status === "ACTIVE") ?? discounts[0];

  const validations = data.validations.nodes.filter((v) => v.shopifyFunction.id === orderLimitId);
  const validation = validations.find((v) => v.enabled) ?? validations[0];

  return {
    refillReward: discount
      ? {
          functionReady: true,
          ownerId: discount.id,
          title: discount.discount.title,
          active: discount.discount.status === "ACTIVE",
          status: discount.discount.status,
          settings: readRefillRewardSettings(discount.config),
        }
      : missing(refillRewardId !== null),
    orderLimit: validation
      ? {
          functionReady: true,
          ownerId: validation.id,
          title: validation.title,
          active: validation.enabled,
          status: validation.enabled ? "ACTIVE" : "OFF",
          settings: readOrderLimitSettings(validation.config?.jsonValue),
        }
      : missing(orderLimitId !== null),
  };
}
