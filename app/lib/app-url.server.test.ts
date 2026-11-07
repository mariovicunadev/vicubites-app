import { describe, expect, it } from "vitest";
import { getAppUrl } from "./app-url.server";

describe("getAppUrl", () => {
  it("uses SHOPIFY_APP_URL without trailing slashes", () => {
    expect(getAppUrl({ SHOPIFY_APP_URL: "https://app.example.com/" })).toBe("https://app.example.com");
  });

  it("prefers SHOPIFY_APP_URL over the Vercel production domain", () => {
    expect(
      getAppUrl({ SHOPIFY_APP_URL: "https://tunnel.example.com", VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" }),
    ).toBe("https://tunnel.example.com");
  });

  it("falls back to the Vercel production domain over https", () => {
    expect(getAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "app.vercel.app" })).toBe("https://app.vercel.app");
  });

  it("returns an empty string when no URL is configured", () => {
    expect(getAppUrl({ SHOPIFY_APP_URL: "  " })).toBe("");
  });
});
