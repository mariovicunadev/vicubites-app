import { describe, expect, it } from "vitest";

import { orderNumber, parsePixelEvent, reminderFunnel, type StoredEvent } from "./events";

const body = (fields: Record<string, unknown>) => JSON.stringify(fields);

describe("parsePixelEvent", () => {
  it("accepts a reminder event and normalizes the species", () => {
    expect(parsePixelEvent(body({ name: "reminder_viewed", clientId: "abc-123", species: "Dog", bucket: "0-7" }))).toEqual({
      name: "reminder_viewed",
      clientId: "abc-123",
      species: "dog",
      bucket: "0-7",
      orderId: null,
    });
  });

  it("keeps the numeric order ID of a checkout", () => {
    expect(
      parsePixelEvent(body({ name: "checkout_completed", clientId: "abc", orderId: "gid://shopify/Order/6123" }))?.orderId,
    ).toBe("6123");
  });

  it("drops an unknown bucket but keeps the event", () => {
    expect(parsePixelEvent(body({ name: "reminder_clicked", clientId: "abc", species: "cat", bucket: "soon" }))?.bucket).toBeNull();
  });

  it("rejects unknown names, bad client IDs, missing species or order, bad JSON and big bodies", () => {
    expect(parsePixelEvent(body({ name: "page_viewed", clientId: "abc", species: "dog" }))).toBeNull();
    expect(parsePixelEvent(body({ name: "reminder_viewed", clientId: "<script>", species: "dog" }))).toBeNull();
    expect(parsePixelEvent(body({ name: "reminder_viewed", clientId: "abc", species: "fish" }))).toBeNull();
    expect(parsePixelEvent(body({ name: "checkout_completed", clientId: "abc" }))).toBeNull();
    expect(parsePixelEvent("{not json")).toBeNull();
    expect(parsePixelEvent(body({ name: "reminder_viewed", clientId: "abc", species: "dog", pad: "x".repeat(2000) }))).toBeNull();
  });
});

describe("orderNumber", () => {
  it("reads GIDs, digits and numbers", () => {
    expect(orderNumber("gid://shopify/Order/42")).toBe("42");
    expect(orderNumber("42")).toBe("42");
    expect(orderNumber(42)).toBe("42");
    expect(orderNumber("none")).toBeNull();
    expect(orderNumber(undefined)).toBeNull();
  });
});

describe("reminderFunnel", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 10, 3, 12, minute));
  const event = (name: string, clientId: string, minute: number, orderId: string | null = null): StoredEvent => ({
    name,
    clientId,
    orderId,
    createdAt: at(minute),
  });

  it("counts browsers and dry food reorders made after a view", () => {
    const funnel = reminderFunnel(
      [
        event("reminder_viewed", "a", 1),
        event("reminder_viewed", "a", 2),
        event("reminder_clicked", "a", 3),
        event("checkout_completed", "a", 4, "100"),
        event("reminder_viewed", "b", 5),
        event("checkout_completed", "c", 6, "101"),
      ],
      new Set(["100", "101"]),
    );
    expect(funnel).toEqual({ viewed: 2, clicked: 1, reorders: 1 });
  });

  it("ignores checkouts before the first view and orders without dry food", () => {
    const funnel = reminderFunnel(
      [event("checkout_completed", "a", 1, "100"), event("reminder_viewed", "a", 2), event("checkout_completed", "a", 3, "999")],
      new Set(["100"]),
    );
    expect(funnel.reorders).toBe(0);
  });
});
