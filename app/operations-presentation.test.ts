import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ loader: {} as Record<string, unknown>, fetcher: {} as Record<string, unknown> }));
vi.mock("./shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("./lib/bulk/jobs.server", () => ({ createBulkJob: vi.fn(), listBulkJobs: vi.fn(), refreshStaleJobs: vi.fn() }));
vi.mock("./lib/hubspot/sync.server", () => ({ loadCrmSyncStatus: vi.fn(), syncAllCompanies: vi.fn() }));
vi.mock("@shopify/app-bridge-react", () => ({ useAppBridge: () => ({ toast: { show: vi.fn() } }) }));
vi.mock("react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router")>(),
  useLoaderData: () => state.loader,
  useFetcher: () => ({ state: "idle", submit: vi.fn(), ...state.fetcher }),
  useRevalidator: () => ({ state: "idle", revalidate: vi.fn() }),
}));

import Exports from "./routes/app.exports";
import B2BCrm from "./routes/app.b2b-crm";

function render(Component: ComponentType, name: string) {
  const html = renderToStaticMarkup(createElement(Component));
  if (process.env.VERIFY_023) {
    mkdirSync("tmp/023", { recursive: true });
    const css = readFileSync("app/styles/estudio-tecnico.css", "utf8");
    writeFileSync(`tmp/023/${name}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Operations verification</title><style>${css} body{margin:0} main{padding:24px} h1{font-size:24px}</style></head><body><main class="et"><h1>Operations</h1>${html}</main></body></html>`);
  }
  return html;
}

beforeEach(() => { state.fetcher = {}; });

describe("Exports presentation", () => {
  it("renders the empty state and refresh errors", () => {
    state.loader = { jobs: [], refreshError: "Test refresh failed." };
    const html = render(Exports, "exports-empty");
    expect(html).toContain("No exports yet.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Test refresh failed.");
    expect(html).not.toContain('disabled=""');
  });

  it("preserves statuses, counts and all download states", () => {
    state.loader = {
      refreshError: null,
      jobs: ["ready", "partial", "expired", "none"].map((download, index) => ({
        id: `test-${index}`, download, status: index === 1 ? "FAILED" : "COMPLETED",
        tone: index === 1 ? "critical" : "success", running: false,
        createdAt: "Nov 23, 2026, 10:00 AM UTC", roots: 12, objects: 48,
        errorCode: index === 1 ? "TEST_ERROR" : null,
      })),
    };
    const html = render(Exports, "exports-loaded");
    expect(html).toContain("Partial CSV");
    expect(html).toContain("Expired after 7 days");
    expect(html).toContain("FAILED · TEST_ERROR");
    expect(html).toContain('aria-label="Catalog export jobs" tabindex="0"');
    expect(html.match(/scope="col"/g)).toHaveLength(5);
    expect(html).toContain('class="num">48</td>');
  });

  it("disables starting while a job runs or a request is pending", () => {
    state.loader = { jobs: [{ id: "test-running", running: true, download: "none", status: "RUNNING", tone: "info" }], refreshError: null };
    expect(render(Exports, "exports-running")).toContain('disabled=""');
    state.loader = { jobs: [], refreshError: null };
    state.fetcher = { state: "submitting", data: { error: "Test start failed." } };
    const html = render(Exports, "exports-pending");
    expect(html).toContain("Starting export…");
    expect(html).toContain('disabled="" aria-busy="true"');
    expect(html).toContain("Test start failed.");
  });
});

describe("B2B CRM presentation", () => {
  it("shows disconnected guidance without a sync action", () => {
    state.loader = { connected: false, lastSyncedAt: null, companies: 0, contacts: 0, failures: [] };
    const html = render(B2BCrm, "crm-disconnected");
    expect(html).toContain("HubSpot not connected");
    expect(html).toContain("Nothing synced yet.");
    expect(html).not.toContain("<button");
  });

  it("preserves connected summary, failures and sync results", () => {
    state.loader = {
      connected: true, lastSyncedAt: "2026-11-23T10:00:00Z", companies: 2, contacts: 3,
      failures: [{ objectType: "COMPANY", shopifyId: "gid://shopify/Company/test-1", error: "Test CRM rejected record.", syncedAt: "2026-11-23T10:00:00Z" }],
    };
    state.fetcher = { data: { run: { companies: 2, contacts: 3, failed: 1 } } };
    const html = render(B2BCrm, "crm-loaded");
    expect(html).toContain("Synced 2 companies and 3 contacts · failed 1.");
    expect(html).toContain("2026-11-23 10:00 UTC.");
    expect(html).toContain("Test CRM rejected record.");
    expect(html).toContain('role="status"');
    expect(html.match(/scope="col"/g)).toHaveLength(3);
    state.fetcher = { state: "submitting", data: { error: "Test Shopify failure." } };
    const pending = render(B2BCrm, "crm-pending");
    expect(pending).toContain('disabled="" aria-busy="true"');
    expect(pending).toContain("Syncing…");
    expect(pending).toContain("Test Shopify failure.");
  });
});
