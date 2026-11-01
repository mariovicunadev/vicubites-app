import type { LoaderFunctionArgs } from "react-router";

import { fixTemplateCsv } from "../lib/fix/template";
import { templateProducts } from "../lib/fix/run.server";
import { authenticate } from "../shopify.server";

/** Resource route: the spreadsheet of products with gaps a bulk fix can fill. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const products = await templateProducts(admin.graphql, session.shop);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(fixTemplateCsv(products), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vicubites-nutrition-gaps-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
