import { describe, expect, it } from "vitest";

import { pendingFor, reminderKey } from "./reminder-channels";

const dog = { customerId: "gid://shopify/Customer/1", species: "dog", runOutOn: "2026-11-12" };
const cat = { customerId: "gid://shopify/Customer/1", species: "cat", runOutOn: "2026-11-20" };

describe("pendingFor", () => {
  it("returns every target when nothing was sent", () => {
    expect(pendingFor("FLOW", [dog, cat], [])).toEqual([dog, cat]);
  });

  it("skips targets already sent on the same channel", () => {
    expect(pendingFor("KLAVIYO", [dog, cat], [{ ...dog, channel: "KLAVIYO" }])).toEqual([cat]);
  });

  it("deduplicates each channel on its own", () => {
    const sent = [{ ...dog, channel: "KLAVIYO" }];
    expect(pendingFor("FLOW", [dog], sent)).toEqual([dog]);
  });

  it("treats a new run-out date as a new reminder", () => {
    const sent = [{ ...dog, channel: "FLOW" }];
    const nextBag = { ...dog, runOutOn: "2026-12-10" };
    expect(pendingFor("FLOW", [nextBag], sent)).toEqual([nextBag]);
  });
});

describe("reminderKey", () => {
  it("joins customer, species and run-out date", () => {
    expect(reminderKey(dog)).toBe("gid://shopify/Customer/1|dog|2026-11-12");
  });
});
