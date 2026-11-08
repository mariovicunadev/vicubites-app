import { describe, expect, it } from "vitest";

import type { CheckoutRulesOverviewQuery } from "../../types/admin.generated";
import type { DiscountStatus } from "../../types/admin.types";
import { toCheckoutRulesView } from "./overview";

const HANDLES = { refillReward: "refill-reward", orderLimit: "order-limit" };
const FUNCTIONS = [
  { id: "fn-reward", handle: "refill-reward" },
  { id: "fn-limit", handle: "order-limit" },
];

type DiscountNode = CheckoutRulesOverviewQuery["discountNodes"]["nodes"][number];
type ValidationNode = CheckoutRulesOverviewQuery["validations"]["nodes"][number];

const appDiscount = (id: string, functionId: string, status: `${DiscountStatus}`, config: unknown = null): DiscountNode => ({
  id,
  config: config === null ? null : { jsonValue: config },
  discount: { __typename: "DiscountAutomaticApp", title: "Refill reward", status: status as DiscountStatus, appDiscountType: { functionId } },
});

const validation = (id: string, functionId: string, enabled: boolean, config: unknown = null): ValidationNode => ({
  id,
  title: "Order limit per product",
  enabled,
  shopifyFunction: { id: functionId },
  config: config === null ? null : { jsonValue: config },
});

function overview({
  functions = FUNCTIONS,
  discounts = [] as DiscountNode[],
  validations = [] as ValidationNode[],
} = {}): CheckoutRulesOverviewQuery {
  return {
    shopifyFunctions: { nodes: functions },
    discountNodes: { nodes: discounts },
    validations: { nodes: validations },
  } as CheckoutRulesOverviewQuery;
}

describe("toCheckoutRulesView", () => {
  it("reads both instances with their settings", () => {
    const view = toCheckoutRulesView(
      overview({
        discounts: [appDiscount("d1", "fn-reward", "ACTIVE", { percentage: 10, windowDays: 14 })],
        validations: [validation("v1", "fn-limit", true, { maxPerVariant: 6 })],
      }),
      HANDLES,
    );
    expect(view.refillReward).toMatchObject({
      functionReady: true,
      ownerId: "d1",
      active: true,
      settings: { percentage: 10, windowDays: 14 },
    });
    expect(view.orderLimit).toMatchObject({ ownerId: "v1", active: true, settings: { maxPerVariant: 6 } });
  });

  it("ignores other apps' discounts and validations", () => {
    const view = toCheckoutRulesView(
      overview({
        discounts: [appDiscount("other", "fn-other", "ACTIVE")],
        validations: [validation("other", "fn-other", true)],
      }),
      HANDLES,
    );
    expect(view.refillReward).toMatchObject({ functionReady: true, ownerId: null });
    expect(view.orderLimit).toMatchObject({ functionReady: true, ownerId: null });
  });

  it("prefers the active instance when there are several", () => {
    const view = toCheckoutRulesView(
      overview({
        discounts: [appDiscount("old", "fn-reward", "EXPIRED"), appDiscount("live", "fn-reward", "ACTIVE")],
        validations: [validation("off", "fn-limit", false), validation("on", "fn-limit", true)],
      }),
      HANDLES,
    );
    expect(view.refillReward.ownerId).toBe("live");
    expect(view.orderLimit.ownerId).toBe("on");
  });

  it("shows an inactive instance and invalid settings as they are", () => {
    const view = toCheckoutRulesView(
      overview({ validations: [validation("v1", "fn-limit", false, { maxPerVariant: 500 })] }),
      HANDLES,
    );
    expect(view.orderLimit).toMatchObject({ ownerId: "v1", active: false, status: "OFF", settings: null });
  });

  it("flags Functions that aren't deployed yet", () => {
    const view = toCheckoutRulesView(overview({ functions: [] }), HANDLES);
    expect(view.refillReward.functionReady).toBe(false);
    expect(view.orderLimit.functionReady).toBe(false);
  });
});
