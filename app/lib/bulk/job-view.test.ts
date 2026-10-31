import { describe, expect, it } from "vitest";

import { toJobView, type BulkJobRow } from "./job-view";

const NOW = new Date("2026-10-31T12:00:00Z");

function job(overrides: Partial<BulkJobRow>): BulkJobRow {
  return {
    id: "job_1",
    kind: "catalog",
    status: "COMPLETED",
    errorCode: null,
    objectCount: 318,
    rootObjectCount: 20,
    url: "https://storage.example/result.jsonl",
    partialDataUrl: null,
    urlExpiresAt: new Date("2026-11-07T12:00:00Z"),
    createdAt: new Date("2026-10-31T11:58:00Z"),
    completedAt: new Date("2026-10-31T11:59:00Z"),
    ...overrides,
  };
}

describe("toJobView", () => {
  it("offers the download while the result URL is valid", () => {
    const view = toJobView(job({}), NOW);

    expect(view).toMatchObject({
      tone: "success",
      running: false,
      download: "ready",
      objects: 318,
      roots: 20,
      createdAt: "Oct 31, 2026, 11:58 AM UTC",
    });
  });

  it("explains an expired result instead of offering a broken download", () => {
    const view = toJobView(job({ urlExpiresAt: new Date("2026-10-30T00:00:00Z") }), NOW);

    expect(view.download).toBe("expired");
  });

  it("offers partial data for a failed operation that produced some", () => {
    const view = toJobView(
      job({
        status: "FAILED",
        errorCode: "TIMEOUT",
        url: null,
        partialDataUrl: "https://storage.example/partial.jsonl",
      }),
      NOW,
    );

    expect(view).toMatchObject({ tone: "critical", download: "partial", errorCode: "TIMEOUT" });
  });

  it("marks created and running operations as in progress", () => {
    expect(toJobView(job({ status: "CREATED", completedAt: null }), NOW).running).toBe(true);
    expect(toJobView(job({ status: "RUNNING", completedAt: null }), NOW)).toMatchObject({
      running: true,
      download: "none",
      completedAt: null,
    });
  });

  it("falls back to a neutral badge for an unknown stored status", () => {
    expect(toJobView(job({ status: "PAUSED" }), NOW)).toMatchObject({
      tone: "neutral",
      running: false,
      download: "none",
    });
  });
});
