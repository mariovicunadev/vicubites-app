import { describe, expect, it, vi } from "vitest";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import { AdminApiError } from "./errors";
import { adminGraphql, operationName } from "./graphql.server";

type AdminGraphql = AdminApiContext["graphql"];

const QUERY = `
  query testShopName {
    shop {
      name
    }
  }
`;

/** Minimal stand-in for `admin.graphql`, which resolves to a fetch Response. */
function fakeGraphql(body: unknown): AdminGraphql {
  return vi.fn(async () => new Response(JSON.stringify(body))) as unknown as AdminGraphql;
}

describe("operationName", () => {
  it("extracts the operation name from a tagged document", () => {
    expect(operationName(QUERY)).toBe("testShopName");
    expect(operationName("mutation productUpdate($id: ID!) { x }")).toBe("productUpdate");
  });

  it("falls back for anonymous operations", () => {
    expect(operationName("{ shop { name } }")).toBe("anonymous");
  });
});

describe("adminGraphql", () => {
  it("returns data and forwards variables", async () => {
    const graphql = fakeGraphql({ data: { shop: { name: "Vicubites" } } });

    const data = await adminGraphql(graphql, QUERY, { variables: {} });

    expect(data).toEqual({ shop: { name: "Vicubites" } });
    expect(graphql).toHaveBeenCalledWith(QUERY, { variables: {} });
  });

  it("throws an empty-response error when the API returns no data", async () => {
    const graphql = fakeGraphql({});

    await expect(adminGraphql(graphql, QUERY)).rejects.toMatchObject({
      kind: "empty-response",
      operation: "testShopName",
    });
  });

  it("normalizes client failures into AdminApiError", async () => {
    const graphql = vi.fn(async () => {
      throw new Error("Throttled");
    }) as unknown as AdminGraphql;

    await expect(adminGraphql(graphql, QUERY)).rejects.toBeInstanceOf(AdminApiError);
  });
});
