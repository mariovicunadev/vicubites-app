# 015 — Markets and translations (English and Spanish)

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/015-markets-translations` |
| Estimate  | 2.5–3.5 h (AI-assisted) · 6–8 h manual |
| Actual    | ~1.5 h (store sweep and translations, two app releases; the full walkthrough and axe pass moved to follow-up work) |

## Goal

Every buyer sees the store, cart, checkout and customer account entirely in their language, English
or Spanish, with nothing mixed. English is the primary language; Spanish is published for the
Worldwide market.

## Context

Markets groups countries and decides, per market, currency, domain or subfolder and published
languages. The store runs one **Worldwide** market (237 regions) with English as the default
language and Spanish published, served under `/es`. Shopify Translate & Adapt is installed and its
automatic Spanish translation has run.

Translations are a layer over the original content, which is always in the primary language. Each
translatable field exposes a `translatableContentDigest` (a hash of the original); a translation is
registered against that digest with `translationsRegister` and is marked outdated when the original
changes.

Some content was originally written in Spanish (for example, the shipping discount titled
"ENVÍO GRATIS"). Its original therefore shows Spanish to English buyers, and its automatic "Spanish
translation" is a copy. The fix is to rewrite the original in English and register the Spanish
version as its translation.

Text that apps render follows the buyer's language separately:

- UI extensions (`refill-checkout`, `refill-account`) already ship `en.default.json` and `es.json`.
- The theme app extension `refill-radar` ships only English.
- Shopify Functions translate only their name and description through locale files. Messages they
  return to the buyer (`Refill reward` discount message, `order-limit` validation error) are built in
  code, so the function reads `localization.language.isoCode` from its input query and picks the
  string.

## Scope

**In scope**
- Sweep every translatable resource for originals written in Spanish: products, variants and
  options, collections, metafields, metaobjects, menus and links, pages, blogs and articles, shop
  and policies, delivery methods, filters, theme content (Horizon section and block settings,
  locale overrides), email and notification templates where they were customised.
- Rewrite each Spanish original in English (descriptive copy only, no health or performance claims)
  and register the Spanish text with `translationsRegister` against the new digest.
- Review the automatic Spanish translations of English originals that buyers see on product, cart,
  checkout and account pages; correct the ones that read wrong.
- Discounts: rename the "ENVÍO GRATIS" shipping discount to English. If discount titles are not a
  translatable resource in API 2026-10, the English title is shown in both languages and the
  limitation is documented here.
- `refill-radar` theme app extension: add `locales/es.json` with every key in `en.default.json`.
- `refill-reward` and `order-limit` functions: read `localization { language { isoCode } }` and
  return the Spanish message when the buyer language is Spanish; unit tests for both languages.
- `README.md`: a short "Languages" section (where each kind of text is translated).

**Out of scope**
- New markets, market-specific prices, currencies or domains (one Worldwide market stays).
- Market-specific translations (`marketId` on `TranslationInput`).
- Languages other than English and Spanish.
- Admin-only text (the `nutrition-health-block` admin extension, function names in the admin).
- Klaviyo email content (managed in Klaviyo, outside Shopify).

## Acceptance criteria

- [x] Shop locales: English primary and published, Spanish published for the Worldwide market
  (`shopLocales` read by API; the market assignment is confirmed in the admin, since
  `marketWebPresences` needs `read_markets`).
- [x] No translatable resource that buyers can see has a Spanish original: sweep report lists zero
  remaining.
- [x] Every rewritten resource has an up-to-date Spanish translation (not outdated against the digest).
- [x] The shipping discount shows an English title in an English checkout and the expected title in a
  Spanish checkout (or the documented limitation if titles are not translatable). Renamed to "Free
  shipping" and read back by API; titles are not translatable (see Findings).
- [x] `refill-radar` block renders in Spanish on `/es` and in English on the default URL (heading,
  sentence, localized run-out date and note checked on the storefront in both languages).
- [x] `refill-reward` message and `order-limit` error are returned in the buyer language; function tests
  cover `EN` and `ES`.
- [ ] Walkthrough in English and in Spanish with nothing mixed: product page, cart, checkout with the
  Refill Radar block, customer account Refill Radar page. **Open, moved to follow-up work:** the
  Spanish product page still shows hardcoded English in theme code (purchase options), the checkout
  block does not render in Spanish because the translated `custom.species` value no longer matches
  (see Known limitations), and the refill reward cannot be checked while `refill_run_out` is missing.
- [ ] One axe pass on the Spanish product page and checkout (announced); no new violations. **Open:**
  runs with the follow-up walkthrough.
- [x] Access scopes: only the ones this feature needs, listed below
- [x] Every Admin GraphQL operation is validated against the pinned API version; function input queries
  are typed by codegen
- [x] `npm run typecheck`, `npm run lint` and `npm test` pass

## Technical approach

- **Sweep:** `translatableResources(resourceType: …)` for each type, paginated, with
  `translations(locale: "es") { key value outdated }`; flag originals whose text is Spanish (word
  heuristic plus manual review). Run with the store CLI session (`shopify store execute`), not from
  the app. The sweep is a one-off and stays out of the app code.
- **Rewrite and register:** update the original through its own mutation (`productUpdate`,
  `metaobjectUpdate`, `menuUpdate`, theme settings through the theme files…), re-read the digest, then
  `translationsRegister(resourceId, translations: [{ locale: "es", key, value,
  translatableContentDigest }])`.
- **Theme content** that lives in the theme (`templates/*.json`, `sections/*.json`, `config/settings_data.json`)
  is changed in `vicubites-theme` on its own branch; Spanish goes in through `translationsRegister` on the
  `ONLINE_STORE_THEME` resources.
- **Functions:** add `localization { language { isoCode } }` to both input queries, a small message map
  per function, regenerate types, `app deploy`.
- **Theme app extension:** `extensions/refill-radar/locales/es.json`, released in the same `app deploy`.

Access scopes: none added to the app. The CLI store session needs `read_translations`,
`write_translations` and `read_locales` (re-authorised by the owner if missing).

## References

- https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/translationsRegister
- https://shopify.dev/docs/api/admin-graphql/2026-10/queries/shopLocales
- https://shopify.dev/docs/api/admin-graphql/2026-10/enums/TranslatableResourceType
- https://shopify.dev/docs/apps/build/functions/localization-practices-shopify-functions

## Findings

- **Discount titles are not translatable.** `TranslatableResourceType` in 2026-10 has no discount type,
  so the native shipping discount was renamed to "Free shipping" and shows that title in both
  languages. It was the only Spanish original in the store.
- **Metafields are nested resources.** There is no `METAFIELD` resource type in 2026-10; product
  metafields come through `nestedTranslatableResources` of each product.
- **Gaps in the automatic translation:** selling plan and selling plan group names, and every image alt
  text (products and collections) had no Spanish. Registered: 8 selling plan fields, 83 alt texts.
- **Corrections to the automatic translation:** two cat products had Spanish meta titles naming dogs;
  mixed regional terms for the guaranteed analysis and for beef; inconsistent capitalisation. 25 fields
  corrected so titles, alt texts and descriptions use the same names.
- Handles (URLs) stay in English on purpose.
- **Function input titles are localized:** `Product.title` in the Function input is the buyer-facing
  localized name, so the `order-limit` error needs only its sentence translated.
- **Dates in the theme app extension:** `%B` is not translated, and named formats (`date: format:`)
  resolve only against the theme's locale files, so they render empty inside an app extension. The
  block builds the date from its own `refill.month_names` and `refill.date_pattern` keys.
- **Theme content translations are per theme.** The unpublished theme had almost no Spanish for its
  sections; 82 translations were registered on it (78 reused from the live theme by key and text).

## Known limitations (follow-up work)

- **Translated values used as keys.** Automatic translation localised `custom.species` ("Dog" →
  "Perro"), `custom.food_type` and `product_type`. Code that compares those values breaks in Spanish:
  the checkout block (`species` must be `dog` or `cat`), the reorder match in the refill reminder, the
  theme's species icon, the feeding calculator's default species and, likely, the refill reward Function
  (`productType`). Follow-up: language-independent product keys (metaobject references with
  fixed handles for logic and translatable labels for display).
- **Hardcoded English in theme code.** Custom theme blocks and sections (purchase options, guaranteed
  analysis, feeding calculator, product comparison) render fixed English strings. Follow-up: move them
  to the theme's locale files.
- **Missing refill metafields.** The `refill_run_out` and `refill_variants` customer definitions and
  their values are missing in the store, so the refill reward does not apply. Follow-up fix in the app.

## Risks and open questions

- Automatic translations may reword product copy; every change to buyer-facing copy is reviewed.
- Theme content edited in the admin after the sweep produces outdated translations; Translate & Adapt
  shows them.
- Checkout and account text that Shopify owns (buttons, labels) follow the buyer language natively and
  are not part of this work.
