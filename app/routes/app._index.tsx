import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "../lib/admin/errors";
import { adminGraphql } from "../lib/admin/graphql.server";
import { formatCount } from "../lib/format";
import { apiVersion, authenticate } from "../shopify.server";

const SHOP_OVERVIEW_QUERY = `#graphql
  query shopOverview {
    shop {
      name
      myshopifyDomain
    }
    productsCount {
      count
      precision
    }
    ingredientDefinition: metaobjectDefinitionByType(type: "ingredient") {
      name
      metaobjectsCount
    }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  try {
    const { shop, productsCount, ingredientDefinition } = await adminGraphql(
      admin.graphql,
      SHOP_OVERVIEW_QUERY,
    );

    return {
      error: null,
      overview: {
        shopName: shop.name,
        shopDomain: shop.myshopifyDomain,
        products: productsCount
          ? formatCount(productsCount.count, productsCount.precision)
          : "—",
        ingredients: ingredientDefinition
          ? formatCount(ingredientDefinition.metaobjectsCount)
          : "Not defined",
        apiVersion,
      },
    };
  } catch (error) {
    if (error instanceof AdminApiError) {
      return { error: error.message, overview: null };
    }
    throw error;
  }
};

export default function Index() {
  const { overview, error } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Overview">
      {error && (
        <s-banner heading="Store data could not be loaded" tone="critical">
          {error}
        </s-banner>
      )}

      {overview && (
        <>
          <s-section heading="Catalog">
            <s-grid gridTemplateColumns="1fr 1fr" gap="base">
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Products</s-text>
                  <s-heading>{overview.products}</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" border="base" borderRadius="base">
                <s-stack direction="block" gap="small-200">
                  <s-text color="subdued">Ingredient entries</s-text>
                  <s-heading>{overview.ingredients}</s-heading>
                </s-stack>
              </s-box>
            </s-grid>
          </s-section>

          <s-section heading="Modules">
            <s-stack direction="block" gap="base">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">Nutrition Data Health</s-text>
                <s-badge tone="info">In development</s-badge>
              </s-stack>
              <s-paragraph>
                Scores every product on the completeness of its nutrition data:
                guaranteed analysis, ingredients, feeding guide, image alt text
                and B2B catalog coverage.
              </s-paragraph>
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-text type="strong">Refill Radar</s-text>
                <s-badge tone="info">In development</s-badge>
              </s-stack>
              <s-paragraph>
                Predicts when each customer runs out of food from bag size and
                daily portion, and triggers a timely reorder reminder.
              </s-paragraph>
            </s-stack>
          </s-section>

          <s-section slot="aside" heading="Connection">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong">{overview.shopName}</s-text>
              <s-text color="subdued">{overview.shopDomain}</s-text>
              <s-text color="subdued">Admin API {overview.apiVersion}</s-text>
            </s-stack>
          </s-section>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
