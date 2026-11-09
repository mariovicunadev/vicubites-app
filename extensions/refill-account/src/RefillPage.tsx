import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

import { parseForecasts, remindersOn, toCards, type SpeciesCard } from "./forecast-view";

export default async () => {
  render(<RefillPage />, document.body);
};

const CUSTOMER_ACCOUNT_API = "shopify://customer-account/api/2026-10/graphql.json";

/** Validated against the Customer Account API 2026-10. */
const REFILL_RADAR_QUERY = `query RefillRadarPage {
  customer {
    forecast: metafield(namespace: "$app", key: "refill_forecast") { value }
    reminders: metafield(namespace: "$app", key: "refill_reminders") { value }
  }
  shop { url }
}`;

interface RefillRadarData {
  customer: { forecast: { value: string } | null; reminders: { value: string } | null } | null;
  shop: { url: string };
}

type PageState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; cards: SpeciesCard[]; reminders: boolean };

/**
 * Refill Radar in customer accounts: the customer's forecast per species,
 * read from the app's customer metafields through the Customer Account API
 * (Shopify authenticates the `shopify://` request; no app backend involved).
 */
function RefillPage() {
  const [state, setState] = useState<PageState>({ status: "loading" });
  const { translate, formatDate } = shopify.i18n;

  useEffect(() => {
    fetch(CUSTOMER_ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: REFILL_RADAR_QUERY }),
    })
      .then((response) => response.json() as Promise<{ data?: RefillRadarData }>)
      .then(({ data }) => {
        if (!data) throw new Error("No data");
        const today = new Date().toISOString().slice(0, 10);
        setState({
          status: "ready",
          cards: toCards(parseForecasts(data.customer?.forecast?.value), today, data.shop.url),
          reminders: remindersOn(data.customer?.reminders?.value),
        });
      })
      .catch(() => setState({ status: "error" }));
  }, []);

  const day = (value: string) => formatDate(new Date(`${value}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <s-page heading={translate("heading")} subheading={translate("subheading")}>
      {state.status === "loading" && <s-spinner accessibilityLabel={translate("loading")} />}
      {state.status === "error" && <s-banner tone="critical">{translate("loadFailed")}</s-banner>}
      {state.status === "ready" && state.cards.length === 0 && (
        <s-section>
          <s-heading>{translate("empty.heading")}</s-heading>
          <s-paragraph>{translate("empty.body")}</s-paragraph>
        </s-section>
      )}
      {state.status === "ready" && state.cards.length > 0 && (
        <s-stack gap="base">
          {state.cards.map((card) => (
            <s-section key={card.species} heading={translate(`species.${card.species}`)}>
              <s-stack gap="small-200">
                <s-stack direction="inline" gap="small-200">
                  <s-badge tone={card.dueSoon ? "critical" : "neutral"}>
                    {card.daysLeft < 0
                      ? translate("ranOut")
                      : translate("daysLeft", { count: card.daysLeft })}
                  </s-badge>
                </s-stack>
                <s-text>{translate("runOutOn", { date: day(card.runOutOn) })}</s-text>
                <s-text color="subdued">
                  {translate("lastOrder", { date: day(card.lastOrderOn), count: card.daysOfFood })}
                </s-text>
                {card.reorderUrl && (
                  <s-button href={card.reorderUrl} variant={card.dueSoon ? "primary" : "secondary"}>
                    {translate("reorder")}
                  </s-button>
                )}
              </s-stack>
            </s-section>
          ))}
          <s-text color="subdued">{translate(state.reminders ? "remindersOn" : "remindersOff")}</s-text>
        </s-stack>
      )}
    </s-page>
  );
}
