import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DECLARED_CUSTOMER_DEFINITIONS, missingDefinitions } from "./definitions";

describe("missingDefinitions", () => {
  const declared = [
    { key: "refill_run_out", type: "date" },
    { key: "refill_variants", type: "list.variant_reference" },
  ];

  it("returns nothing when every declared definition exists", () => {
    expect(missingDefinitions(declared, [...declared, { key: "other", type: "json" }])).toEqual([]);
  });

  it("returns the definitions the store lacks", () => {
    expect(missingDefinitions(declared, [{ key: "refill_variants", type: "list.variant_reference" }])).toEqual([
      { key: "refill_run_out", type: "date" },
    ]);
  });

  it("treats a definition with another type as missing", () => {
    expect(missingDefinitions(declared, [...declared.slice(1), { key: "refill_run_out", type: "json" }])).toEqual([
      { key: "refill_run_out", type: "date" },
    ]);
  });
});

describe("DECLARED_CUSTOMER_DEFINITIONS", () => {
  it("matches the customer definitions in shopify.app.toml", () => {
    const toml = readFileSync(new URL("../../../shopify.app.toml", import.meta.url), "utf8");
    const fromToml = [...toml.matchAll(/^\[customer\.metafields\.app\.(\w+)\]\s*\ntype = "([^"]+)"/gm)].map(
      ([, key, type]) => ({ key, type }),
    );
    expect(fromToml).toEqual(DECLARED_CUSTOMER_DEFINITIONS.map((definition) => ({ ...definition })));
  });
});
