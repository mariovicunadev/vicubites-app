import { describe, expect, it } from "vitest";

import { AdminApiError, assertNoUserErrors, toAdminApiError } from "./errors";

describe("assertNoUserErrors", () => {
  it("passes when the payload has no user errors", () => {
    expect(() => assertNoUserErrors("productUpdate", [])).not.toThrow();
    expect(() => assertNoUserErrors("productUpdate", null)).not.toThrow();
  });

  it("throws a user-errors AdminApiError with the field path in the message", () => {
    const run = () =>
      assertNoUserErrors("productUpdate", [
        { field: ["product", "title"], message: "Title can't be blank" },
      ]);

    expect(run).toThrow(AdminApiError);
    expect(run).toThrow("productUpdate failed: product.title: Title can't be blank");
    try {
      run();
    } catch (error) {
      expect((error as AdminApiError).kind).toBe("user-errors");
    }
  });
});

describe("toAdminApiError", () => {
  it("reads GraphQL errors attached by @shopify/shopify-api", () => {
    const thrown = Object.assign(new Error("Access denied"), {
      body: {
        errors: {
          graphQLErrors: [
            { message: "Access denied", extensions: { code: "ACCESS_DENIED" } },
          ],
        },
      },
    });

    const error = toAdminApiError("shopOverview", thrown);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      kind: "graphql",
      operation: "shopOverview",
      details: [{ message: "Access denied", code: "ACCESS_DENIED" }],
      cause: thrown,
    });
  });

  it("returns a thrown Response untouched so re-authentication redirects work", () => {
    const redirect = new Response(null, { status: 302 });

    expect(toAdminApiError("shopOverview", redirect)).toBe(redirect);
  });

  it("does not wrap an AdminApiError twice", () => {
    const original = new AdminApiError("user-errors", "productUpdate", []);

    expect(toAdminApiError("shopOverview", original)).toBe(original);
  });

  it("wraps unknown failures as graphql errors", () => {
    const error = toAdminApiError("shopOverview", new Error("socket hang up"));

    expect(error).toMatchObject({
      kind: "graphql",
      details: [{ message: "socket hang up" }],
    });
  });
});
