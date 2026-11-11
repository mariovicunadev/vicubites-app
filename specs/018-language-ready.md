# 018 — Ready for any language

| Field     | Value |
|-----------|-------|
| Status    | Done      |
| Branch    | `feature/018-language-ready` |
| Estimate  | 1–1.5 h (AI-assisted) · 3–4 h manual |
| Actual    | ~1.25 h |

## Goal

Adding a third storefront language takes content and locale files only, plus at most one line of code per
Function message map. A test shows what is missing for each supported language, and a runbook lists the steps.

## Context

The store runs in English and Spanish (specs 015, 016, theme 015). Logic already keys on language-independent
values, and content is translated with Translate & Adapt. Two gaps remain before another language is routine:

- **Function messages.** A Function's locale files translate only its name and description. The message a
  buyer sees comes from code that reads `localization.language.isoCode`. `refill-reward` and `order-limit`
  pick Spanish with an `if` and fall back to English, so each new language means a code change in two
  different shapes.
- **Extension locale coverage.** Buyer-facing UI extensions (`refill-radar`, `refill-checkout`,
  `refill-account`) have `en.default.json` and `es.json`. Nothing checks that every supported language has a
  file with every key, so a missing key falls back to English without anyone noticing.

## Scope

**In scope**
- `refill-reward` and `order-limit`: messages in one map per Function, keyed by `LanguageCode`, with the
  English fallback in a single helper. Adding a language means adding one map entry.
- A shared list of supported languages (`en`, `es`) in the app, and a test that fails when a buyer-facing
  extension lacks a locale file for a supported language, or when that file misses any key of
  `en.default.json`. The test also fails when a Function message map lacks a supported language.
- An "Add a language" runbook in the app README (`## Languages`): publish the language, translate content
  (Translate & Adapt or `translationsRegister`), theme locale file, extension locale files, Function maps,
  deploy, then verify.

**Out of scope**
- Publishing a third language or translating to one.
- Merchant-only extensions (`nutrition-health-block`, `starter-kit-expand`): admin and Function names stay
  in English.
- Translating ingredient content (a separate data step).
- Discount titles: not translatable in 2026-10 (platform limit, documented in the runbook).

## Acceptance criteria

- [x] Given a buyer language with a map entry, then each Function returns that message; given any other
      language, then it returns English (unit tests for EN, ES and a third code)
- [x] Given a supported language, when a buyer-facing extension has no locale file for it or the file lacks
      a key from `en.default.json`, then the locale test fails and names the extension, file and key
- [x] Given a Function message map without a supported language, then the test fails
- [x] Given English and Spanish today, then the locale test passes and every message reads as before
- [x] The README runbook lists every step to add a language, including the platform limits
- [x] Access scopes: none added
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass; Function tests
      pass and `shopify app deploy` releases the Functions unchanged in behavior

## Technical approach

- `app/lib/i18n/languages.ts`: `SUPPORTED_LANGUAGES = ["en", "es"] as const`.
- Functions: `MESSAGES: Partial<Record<LanguageCode, …>>` plus `messageFor(language)` that falls back to
  `EN`. `order-limit` keeps a template function per language, since its message takes the limit and the
  product title.
- `app/lib/i18n/extension-locales.test.ts`: reads `extensions/{refill-radar,refill-checkout,refill-account}/
  locales/`, flattens the JSON keys and compares each supported language file with `en.default.json`. It
  imports the Function maps (pure modules) and checks their language keys.
- README `## Languages`: the runbook.

## Verification

- Adding `fr` to `SUPPORTED_LANGUAGES` makes five tests fail, naming the three extension locale files and the
  two Function maps; removing it makes them pass again.
- Unit tests: refill reward and order limit return English, Spanish and the English fallback for French as before.
- Both Functions build with `shopify app function build`; 340 tests, typecheck, lint and build pass.

## References

- Localization practices for Shopify Functions:
  https://shopify.dev/docs/apps/build/functions/localization-practices-shopify-functions
- Checkout UI extension localization: https://shopify.dev/docs/api/checkout-ui-extensions/latest#localization

## Risks and open questions

- The Functions are compiled separately from the app. The test imports their pure message modules, so
  those modules must not import generated runtime enums that exist only in the Function build. Compare by
  the string values of `LanguageCode` instead.
