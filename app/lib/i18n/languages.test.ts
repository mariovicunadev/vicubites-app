import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ORDER_LIMIT_MESSAGES } from "../../../extensions/order-limit/src/order-limit";
import { REFILL_REWARD_MESSAGES } from "../../../extensions/refill-reward/src/cart_lines_discounts_generate_run";
import { BUYER_FACING_EXTENSIONS, SUPPORTED_LANGUAGES, localeKeys, missingKeys } from "./languages";

const extensionsDir = new URL("../../../extensions/", import.meta.url);

function readLocale(extension: string, file: string): Record<string, unknown> | null {
  const url = new URL(`${extension}/locales/${file}`, extensionsDir);
  return existsSync(url) ? (JSON.parse(readFileSync(url, "utf8")) as Record<string, unknown>) : null;
}

describe("localeKeys and missingKeys", () => {
  const base = { heading: "Refill", refill: { day: "{{ count }} day", month_names: "January" } };

  it("flattens nested keys", () => {
    expect(localeKeys(base)).toEqual(["heading", "refill.day", "refill.month_names"]);
  });

  it("lists the keys a locale lacks", () => {
    expect(missingKeys(base, { heading: "Recarga", refill: { day: "{{ count }} día" } })).toEqual([
      "refill.month_names",
    ]);
  });
});

describe("buyer-facing extensions cover every supported language", () => {
  for (const extension of BUYER_FACING_EXTENSIONS) {
    const base = readLocale(extension, "en.default.json");

    it(`${extension} has an English default locale`, () => {
      expect(base, `${extension}/locales/en.default.json`).not.toBeNull();
    });

    for (const language of SUPPORTED_LANGUAGES.filter((code) => code !== "en")) {
      it(`${extension} has every key in ${language}.json`, () => {
        const locale = readLocale(extension, `${language}.json`);
        expect(locale, `${extension}/locales/${language}.json is missing`).not.toBeNull();
        expect(missingKeys(base ?? {}, locale ?? {}), `${extension}/locales/${language}.json`).toEqual([]);
      });
    }
  }
});

describe("Function messages cover every supported language", () => {
  // Function input sends LanguageCode values in uppercase (EN, ES).
  const maps = { "refill-reward": REFILL_REWARD_MESSAGES, "order-limit": ORDER_LIMIT_MESSAGES };

  for (const [name, messages] of Object.entries(maps)) {
    it(`${name} has a message for each supported language`, () => {
      const missing = SUPPORTED_LANGUAGES.filter((code) => !(code.toUpperCase() in messages));
      expect(missing, name).toEqual([]);
    });
  }
});
