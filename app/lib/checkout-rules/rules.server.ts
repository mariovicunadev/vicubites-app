import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { DiscountClass } from "../../types/admin.types";
import { assertNoUserErrors } from "../admin/errors";
import { adminGraphql } from "../admin/graphql.server";
import { toCheckoutRulesView, type CheckoutRulesView } from "./overview";
import {
  ORDER_LIMIT_CONFIG_KEY,
  REFILL_REWARD_CONFIG_KEY,
  type OrderLimitSettings,
  type RefillRewardSettings,
} from "./settings";

type AdminGraphql = AdminApiContext["graphql"];

export const REFILL_REWARD_HANDLE = "refill-reward";
export const ORDER_LIMIT_HANDLE = "order-limit";

/**
 * `shopifyFunctions` lists only this app's Functions, so their IDs identify
 * our instances among every app discount and validation in the store.
 */
const CHECKOUT_RULES_OVERVIEW = `#graphql
  query checkoutRulesOverview {
    shopifyFunctions(first: 25) {
      nodes {
        id
        handle
      }
    }
    discountNodes(first: 25, query: "type:app") {
      nodes {
        id
        config: metafield(namespace: "$app", key: "refill-reward-config") {
          jsonValue
        }
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title
            status
            appDiscountType {
              functionId
            }
          }
        }
      }
    }
    validations(first: 25) {
      nodes {
        id
        title
        enabled
        shopifyFunction {
          id
        }
        config: metafield(namespace: "$app", key: "order-limit-config") {
          jsonValue
        }
      }
    }
  }
`;

const REFILL_REWARD_CREATE = `#graphql
  mutation refillRewardCreate($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const ORDER_LIMIT_CREATE = `#graphql
  mutation orderLimitCreate($validation: ValidationCreateInput!) {
    validationCreate(validation: $validation) {
      validation {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const CHECKOUT_RULE_CONFIG_SET = `#graphql
  mutation checkoutRuleConfigSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export async function loadCheckoutRules(graphql: AdminGraphql): Promise<CheckoutRulesView> {
  return toCheckoutRulesView(await adminGraphql(graphql, CHECKOUT_RULES_OVERVIEW), {
    refillReward: REFILL_REWARD_HANDLE,
    orderLimit: ORDER_LIMIT_HANDLE,
  });
}

function configMetafield(key: string, settings: object) {
  return { namespace: "$app", key, type: "json", value: JSON.stringify(settings) };
}

/**
 * Creates the automatic discount, or rewrites the settings of the existing
 * one (`ownerId` is its `DiscountAutomaticNode` ID).
 */
export async function saveRefillReward(
  graphql: AdminGraphql,
  ownerId: string | null,
  settings: RefillRewardSettings,
): Promise<void> {
  if (ownerId) {
    await setConfig(graphql, ownerId, REFILL_REWARD_CONFIG_KEY, settings);
    return;
  }
  const data = await adminGraphql(graphql, REFILL_REWARD_CREATE, {
    variables: {
      discount: {
        title: "Refill reward",
        functionHandle: REFILL_REWARD_HANDLE,
        startsAt: new Date().toISOString(),
        // Generated enums are types only (no runtime object): pass the literal.
        discountClasses: ["PRODUCT" as DiscountClass],
        // Stacks with the free shipping threshold and order discounts.
        combinesWith: { orderDiscounts: true, shippingDiscounts: true, productDiscounts: false },
        metafields: [configMetafield(REFILL_REWARD_CONFIG_KEY, settings)],
      },
    },
  });
  assertNoUserErrors("refillRewardCreate", data.discountAutomaticAppCreate?.userErrors);
}

/**
 * Creates the validation, enabled and failing open (`blockOnFailure:
 * false`: if the Function itself errors, checkout stays open), or rewrites
 * the settings of the existing one.
 */
export async function saveOrderLimit(
  graphql: AdminGraphql,
  ownerId: string | null,
  settings: OrderLimitSettings,
): Promise<void> {
  if (ownerId) {
    await setConfig(graphql, ownerId, ORDER_LIMIT_CONFIG_KEY, settings);
    return;
  }
  const data = await adminGraphql(graphql, ORDER_LIMIT_CREATE, {
    variables: {
      validation: {
        title: "Order limit per product",
        functionHandle: ORDER_LIMIT_HANDLE,
        enable: true,
        blockOnFailure: false,
        metafields: [configMetafield(ORDER_LIMIT_CONFIG_KEY, settings)],
      },
    },
  });
  assertNoUserErrors("orderLimitCreate", data.validationCreate?.userErrors);
}

async function setConfig(graphql: AdminGraphql, ownerId: string, key: string, settings: object): Promise<void> {
  const data = await adminGraphql(graphql, CHECKOUT_RULE_CONFIG_SET, {
    variables: { metafields: [{ ownerId, ...configMetafield(key, settings) }] },
  });
  assertNoUserErrors("checkoutRuleConfigSet", data.metafieldsSet?.userErrors);
}
