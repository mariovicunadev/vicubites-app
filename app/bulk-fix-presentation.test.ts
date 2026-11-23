import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loader: {} as Record<string, unknown>,
  fetchers: [] as Record<string, unknown>[],
}));
vi.mock("./shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("./lib/bulk/jobs.server", () => ({ refreshStaleJobs: vi.fn() }));
vi.mock("./lib/fix/run.server", () => ({
  applyFix: vi.fn(),
  previewFix: vi.fn(),
  processLatestFix: vi.fn(),
  toFixRunView: vi.fn(),
}));
vi.mock("@shopify/app-bridge-react", () => ({ useAppBridge: () => ({ toast: { show: vi.fn() } }) }));
vi.mock("react-router", async (importOriginal) => {
  let call = 0;
  return {
    ...await importOriginal<typeof import("react-router")>(),
    useLoaderData: () => state.loader,
    useFetcher: () => ({ state: "idle", submit: vi.fn(), ...state.fetchers[call++ % Math.max(state.fetchers.length, 1)] }),
    useRevalidator: () => ({ state: "idle", revalidate: vi.fn() }),
    useNavigate: () => vi.fn(),
  };
});

import BulkFix from "./routes/app.health_.fix";

const plan = {
  fileErrors: [] as string[],
  rowErrors: [] as { line: number; messages: string[] }[],
  unchanged: 1,
  products: [
    {
      productId: "gid://shopify/Product/1",
      title: "Adult Dog Chicken 3 kg",
      changes: [
        { key: "protein", label: "Protein", from: null, to: "26%" },
        { key: "kcal", label: "Calories", from: "320", to: "350" },
      ],
    },
  ],
};
const outcomes = [
  { productId: "gid://shopify/Product/1", title: "Adult Dog Chicken 3 kg", status: "applied", messages: [] },
  { productId: "gid://shopify/Product/2", title: "Senior Cat Salmon 1,5 kg", status: "failed", messages: ["Test metafield rejected."] },
];

function render(Component: ComponentType, name: string) {
  const html = renderToStaticMarkup(createElement(Component));
  if (process.env.VERIFY_024) {
    mkdirSync("tmp/024", { recursive: true });
    const css = readFileSync("app/styles/estudio-tecnico.css", "utf8");
    writeFileSync(`tmp/024/${name}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bulk fix verification</title><style>${css} body{margin:0} main{padding:24px} h1{font-size:24px}</style></head><body><main class="et"><h1>Fix nutrition data in bulk</h1>${html}</main></body></html>`);
  }
  return html;
}

beforeEach(() => {
  state.fetchers = [];
  state.loader = { error: null, lastFix: null };
});

describe("Bulk fix presentation", () => {
  it("renders the three-step flow and a load error banner", () => {
    state.loader = { error: "Test loader failure.", lastFix: null };
    const html = render(BulkFix, "fix-initial");
    expect(html).toContain("1. Download the spreadsheet");
    expect(html).toContain("2. Upload the completed file");
    expect(html).toContain("Test loader failure.");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Download CSV");
  });

  it("renders the review table and apply action from preview data", () => {
    state.fetchers = [{ data: { ok: true, intent: "preview", runId: "run-1", plan } }, {}, {}];
    const html = render(BulkFix, "fix-review");
    expect(html).toContain("3. Review and apply");
    expect(html).toContain("1 product will change · 0 skipped · 1 unchanged");
    expect(html).toContain("Protein:");
    expect(html).toContain("Apply to 1 product");
    expect(html.match(/scope="col"/g)).toHaveLength(2);
  });

  it("lists skipped rows and file errors without an apply action", () => {
    state.fetchers = [
      { data: { ok: true, intent: "preview", runId: "run-1", plan: { ...plan, rowErrors: [{ line: 4, messages: ["Test bad number."] }] } } },
      {},
      {},
    ];
    const html = render(BulkFix, "fix-row-errors");
    expect(html).toContain("Rows skipped: nothing is written for them");
    expect(html).toContain("Line 4: Test bad number.");
    state.fetchers = [
      { data: { ok: true, intent: "preview", runId: "run-1", plan: { ...plan, products: [], fileErrors: ["Test bad header."] } } },
      {},
      {},
    ];
    const rejected = render(BulkFix, "fix-file-errors");
    expect(rejected).toContain("The file can&#x27;t be used");
    expect(rejected).not.toContain("Apply to");
  });

  it("renders running and finished results with badges and the audit action", () => {
    state.loader = { error: null, lastFix: { running: true, outcomes: null } };
    expect(render(BulkFix, "fix-running")).toContain("Fix in progress");
    state.loader = { error: null, lastFix: { running: false, outcomes } };
    const html = render(BulkFix, "fix-results");
    expect(html).toContain("1 applied · 1 failed");
    expect(html).toContain("et-badge--success");
    expect(html).toContain("et-badge--critical");
    expect(html).toContain("Test metafield rejected.");
    expect(html).toContain("Run audit to update scores");
    expect(html).toContain('aria-label="Bulk fix results"');
  });
});
