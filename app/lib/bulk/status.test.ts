import { describe, expect, it } from "vitest";

import {
  isExpired,
  isTerminal,
  parseWebhookErrorCode,
  parseWebhookStatus,
  resultUrlExpiresAt,
} from "./status";

describe("parseWebhookStatus", () => {
  it("maps the webhook's lowercase status to the GraphQL enum value", () => {
    expect(parseWebhookStatus("completed")).toBe("COMPLETED");
    expect(parseWebhookStatus("failed")).toBe("FAILED");
  });

  it("returns null for unknown values", () => {
    expect(parseWebhookStatus("done")).toBeNull();
  });
});

describe("parseWebhookErrorCode", () => {
  it("maps known codes and treats empty values as no error", () => {
    expect(parseWebhookErrorCode("access_denied")).toBe("ACCESS_DENIED");
    expect(parseWebhookErrorCode(null)).toBeNull();
    expect(parseWebhookErrorCode("")).toBeNull();
  });
});

describe("isTerminal", () => {
  it("separates finished operations from running ones", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("RUNNING")).toBe(false);
    expect(isTerminal("CREATED")).toBe(false);
  });
});

describe("result URL expiry", () => {
  const completedAt = new Date("2026-10-01T12:00:00Z");
  const expiresAt = resultUrlExpiresAt(completedAt);

  it("expires seven days after completion", () => {
    expect(expiresAt.toISOString()).toBe("2026-10-08T12:00:00.000Z");
  });

  it("knows when a URL is no longer downloadable", () => {
    expect(isExpired(expiresAt, new Date("2026-10-08T11:59:59Z"))).toBe(false);
    expect(isExpired(expiresAt, new Date("2026-10-08T12:00:00Z"))).toBe(true);
    expect(isExpired(null)).toBe(false);
  });
});
