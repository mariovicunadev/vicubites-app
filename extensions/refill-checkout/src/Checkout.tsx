import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";

import { hasDryFood, REMINDERS_KEY, remindersChecked } from "./refill";

export default async () => {
  render(<Extension />, document.body);
};

/**
 * Refill Radar in checkout: tells the buyer the order updates their refill
 * forecast and lets them turn reminders off or on. The choice is a cart
 * metafield that Shopify copies to the order (cart-to-order copyable).
 */
function Extension() {
  const [failed, setFailed] = useState(false);
  const metafields = shopify.appMetafields.value;
  const lines = shopify.lines.value.map((line) => ({
    productId: line.merchandise.product.id,
    variantId: line.merchandise.id,
  }));
  if (!hasDryFood(lines, metafields)) return null;

  const { translate } = shopify.i18n;
  // Accelerated checkouts (Apple Pay, Google Pay) and draft orders can't set cart metafields.
  const canChoose = shopify.instructions.value.metafields.canSetCartMetafields;

  async function onChange(event: Event) {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    const result = await shopify.applyMetafieldChange({
      type: "updateCartMetafield",
      metafield: { namespace: "$app", key: REMINDERS_KEY, type: "boolean", value: String(checked) },
    });
    setFailed(result.type === "error");
  }

  return (
    <s-stack gap="small-200">
      <s-heading>{translate("heading")}</s-heading>
      <s-text>{translate("forecast")}</s-text>
      {canChoose && (
        <s-checkbox
          label={translate("reminders")}
          checked={remindersChecked(metafields)}
          onChange={onChange}
        />
      )}
      {failed && <s-text tone="critical">{translate("saveFailed")}</s-text>}
    </s-stack>
  );
}
