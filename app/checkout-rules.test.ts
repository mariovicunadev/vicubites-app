import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const state = vi.hoisted(() => ({
  loader: {} as Record<string, unknown>,
  results: [] as Array<Record<string, unknown>>,
  index: 0,
}));

vi.mock("./shopify.server", () => ({ authenticate: { admin: vi.fn() } }));
vi.mock("./lib/checkout-rules/rules.server", () => ({
  loadCheckoutRules: vi.fn(), saveOrderLimit: vi.fn(), saveRefillReward: vi.fn(),
}));
vi.mock("./lib/bundles/bundles.server", () => ({ loadBundles: vi.fn(), saveStarterKit: vi.fn() }));
vi.mock("react-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("react-router")>(),
  useLoaderData: () => state.loader,
  useFetcher: () => ({
    state: "idle",
    Form: "form",
    ...state.results[state.index++],
  }),
}));

import CheckoutRules from "./routes/app.checkout-rules";

function render() {
  state.index = 0;
  return renderToStaticMarkup(createElement(CheckoutRules));
}

function fixtures() {
  const rule = { functionReady: true, ownerId: "test-rule", active: true, status: "ACTIVE" };
  return {
    error: null,
    rules: {
      refillReward: { ...rule, settings: { percentage: 10, windowDays: 7 } },
      orderLimit: { ...rule, settings: { maxPerVariant: 12 } },
    },
    bundles: {
      functionReady: true, eligibleForBundles: true, transformId: "test-transform", outdated: false,
      build: { ok: true, picker: { recipes: [{ label: "Test dry food" }], treats: [{ label: "Test treats" }] } },
    },
  };
}

function saveFixture(name: string, html: string) {
  if (!process.env.VERIFY_022) return;
  mkdirSync("tmp/022", { recursive: true });
  const css = readFileSync("app/styles/estudio-tecnico.css", "utf8");
  writeFileSync(`tmp/022/${name}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Checkout rules verification</title><style>${css} body{margin:0} main{padding:24px} h1{font-size:24px}</style></head><body><main class="et"><h1>Checkout rules</h1>${html}</main></body></html>`);
}

beforeEach(() => {
  state.loader = fixtures();
  state.results = [];
  state.index = 0;
});

describe("Checkout rules presentation", () => {
  it("keeps all form intents, constraints and accessible labels", () => {
    const html = render();
    for (const intent of ["refill-reward", "order-limit", "starter-kit"]) {
      expect(html).toContain(`name="intent" value="${intent}"`);
    }
    for (const name of ["percentage", "windowDays", "maxPerVariant"]) {
      expect(html).toContain(`for="${name}"`);
      expect(html).toContain(`id="${name}"`);
      expect(html).toContain(`aria-describedby="${name}-suffix"`);
    }
    expect(html).toContain('type="number"');
    expect(html).toContain('min="1"');
    expect(html).toContain("Recipes (1)");
    expect(html).toContain("Treat flavors (1)");
    saveFixture("loaded", html);
  });

  it("associates server validation errors with each input", () => {
    state.results = [
      { data: { saved: false, fieldErrors: { percentage: "Enter a whole percentage.", windowDays: "Enter valid days." } } },
      { data: { saved: false, fieldErrors: { maxPerVariant: "Enter a whole limit." } } },
    ];
    const html = render();
    for (const name of ["percentage", "windowDays", "maxPerVariant"]) {
      expect(html).toContain(`aria-describedby="${name}-suffix ${name}-error"`);
      expect(html).toContain(`id="${name}-error" role="alert"`);
    }
    expect(html.match(/aria-invalid="true"/g)).toHaveLength(3);
    saveFixture("validation", html);
  });

  it("renders success, mutation failure and bundle problems", () => {
    state.results = [
      { data: { saved: true, fieldErrors: {} } },
      { data: { saved: false, error: "Test mutation rejected.", fieldErrors: {} } },
      { data: { saved: false, problems: ["Test product is unavailable."], fieldErrors: {} } },
    ];
    const html = render();
    expect(html).toContain('role="status"');
    expect(html).toContain("Test mutation rejected.");
    expect(html).toContain("<li>Test product is unavailable.</li>");
    saveFixture("feedback", html);
  });

  it("disables all submits during pending requests", () => {
    state.results = [{ state: "submitting" }, { state: "loading" }, { state: "submitting" }];
    const html = render();
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    saveFixture("pending", html);
  });

  it("renders missing functions, default settings and bundle eligibility failures", () => {
    const data = fixtures();
    data.rules.refillReward.functionReady = false;
    data.rules.orderLimit.functionReady = false;
    state.loader = {
      ...data,
      rules: {
        refillReward: { ...data.rules.refillReward, ownerId: null, settings: null },
        orderLimit: { ...data.rules.orderLimit, ownerId: null, settings: null },
      },
      bundles: { ...data.bundles, functionReady: false, eligibleForBundles: false, transformId: null, build: { ok: false, problems: ["Test kit is missing."] } },
    };
    const html = render();
    expect(html.match(/disabled=""/g)).toHaveLength(3);
    expect(html).toContain("Create discount");
    expect(html).toContain("Create rule");
    expect(html).toContain("Turn on starter kit");
    expect(html).toContain("Test kit is missing.");
    saveFixture("missing", html);
  });

  it("renders a load failure without forms", () => {
    state.loader = { error: "Test load failed.", rules: null, bundles: null };
    const html = render();
    expect(html).toContain('role="alert"');
    expect(html).toContain("Test load failed.");
    expect(html).not.toContain("<form");
    saveFixture("load-error", html);
  });
});
