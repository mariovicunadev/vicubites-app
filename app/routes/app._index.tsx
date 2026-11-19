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
              <div className="et-panel et-metric">
                <div className="et-metric__label">Products</div>
                <div className="et-metric__value">{overview.products}</div>
              </div>
              <div className="et-panel et-metric">
                <div className="et-metric__label">Ingredient entries</div>
                <div className="et-metric__value">{overview.ingredients}</div>
              </div>
            </s-grid>
          </s-section>

          <s-section heading="Modules">
            <div className="et-panel">
              <div className="et-module">
                <div className="et-module__head">
                  <strong>Nutrition Data Health</strong>
                  <span className="et-tag">In development</span>
                </div>
                <p>
                  Scores every product on the completeness of its nutrition
                  data: guaranteed analysis, ingredients, feeding guide, image
                  alt text and B2B catalog coverage.
                </p>
              </div>
              <div className="et-module">
                <div className="et-module__head">
                  <strong>Refill Radar</strong>
                  <span className="et-tag et-tag--violet">In development</span>
                </div>
                <p>
                  Predicts when each customer runs out of food from bag size and
                  daily portion, and triggers a timely reorder reminder.
                </p>
              </div>
            </div>
          </s-section>

          <aside slot="aside" className="et-panel et-aside">
            <h2 className="et-aside__heading">Connection</h2>
            <strong>{overview.shopName}</strong>
            <span className="et-muted">{overview.shopDomain}</span>
            <span className="et-muted">Admin API {overview.apiVersion}</span>
          </aside>
        </>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
