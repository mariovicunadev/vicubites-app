# 016 — Language-independent product keys

| Field     | Value |
|-----------|-------|
| Status    | In progress |
| Branch    | `feature/016-product-keys` (app and theme) |
| Estimate  | 5–7 h (AI-assisted) · 14–18 h manual |
| Actual    | — |

## Goal

Store logic decides by keys that are never translated, so every feature behaves the same in English
and Spanish. Species and food type become metaobject entries with a fixed handle (the key logic
reads) and a translatable label (the text buyers see).

## Context

Spec 015 published Spanish and ran automatic translation. Product metafields `custom.species`
("Dog", "Cat") and `custom.food_type` ("Dry", "Wet", "Treats") are text, so they were translated
("Perro", "Seco"). Every place that compares them against an English word stops working for Spanish
buyers:

| Consumer | Compares | Effect in Spanish |
|---|---|---|
| `extensions/refill-checkout/src/refill.ts` | species `dog` / `cat` | Refill block never shows |
| `extensions/refill-radar/blocks/refill-reminder.liquid` | variant species vs. forecast | "Reorder" finds no variant |
| `vicubites-theme/snippets/icon-species.liquid` | species `dog` / `cat` | No species icon |
| `vicubites-theme/sections/feeding-calculator.liquid` | product species | Default species falls back to the setting |
| `extensions/refill-reward` (Function) | `productType` "Dry Dog Food" | At risk: product fields reach Functions localized |
| `extensions/refill-checkout/src/refill.ts` | option name `Size` | At risk: option names are translatable; the block may not find the bag size |

Option names and values, variant titles and selling plan names are translatable too. The backend
reads them from the Admin API (original language), but the rule is the same everywhere: logic never
keys on translatable text.

Admin API reads (backend forecast, health score, bulk fix, export) receive the original value and keep
working, but they move to the same keys so there is one rule everywhere.

**How each surface reads a metaobject reference (API 2026-10):**

- **Liquid:** `product.metafields.custom.species.value` is the metaobject; `.system.handle` is the
  key and `.label` the translated text.
- **Admin API:** `metafield { reference { ... on Metaobject { handle } } }`.
- **Checkout UI (`appMetafields`):** only the value, which for a reference is the metaobject GID.
- **Functions:** `Metafield` exposes only `value` and `jsonValue` (the GID); there is no `reference`,
  and root `metaobject` lookups are limited to app-owned metaobjects. A Function cannot read the handle
  of a referenced metaobject.

So the checkout block and the Function work with GIDs: the checkout block only needs to know that a
species is set (the definition only accepts `species` entries), and the Function compares against the
GID of the `dry` entry, which the app writes into the discount's configuration metafield.

## Scope

**In scope**
- Metaobject definitions `species` (entries `dog`, `cat`) and `food_type` (entries `dry`, `wet`,
  `treats`), each with a translatable `label`, storefront read access and the translatable capability;
  Spanish labels registered.
- Product metafield definitions `custom.species` and `custom.food_type` recreated as
  `metaobject_reference` (a metafield can't change type), restricted to their definition, with filter
  access; every product migrated from the old text value to the matching entry.
- Seed script in the theme repo (idempotent) that creates the definitions and entries, recreates the
  product definitions and migrates values; the existing metafield seed writes references from then on.
- App consumers: `refill/orders.ts`, `refill/store.server.ts`, `refill/forecast.ts` (`speciesFrom`),
  `fix/fields.ts` (choices become entries), `health/rules.ts`, `catalog/export.ts`.
- Extensions: `refill-checkout` (species set), `refill-reminder` (handle), `refill-reward` (food type
  GID vs. configured `dry` GID, no `productType`); the app writes the `dry` GID into
  `refill-reward-config`.
- Theme consumers: `icon-species`, `feeding-calculator`, `product-attributes`, `_card-data`,
  `recipe-stamp`, `product-comparison` (handle for logic, label for text).
- Automatic collections and the Search & Discovery filters that use these metafields, rebuilt on the
  new definitions.
- Bag size as a variant metafield `custom.bag_grams` (integer, not translatable), seeded from the
  `Size` option; the checkout block and the backend forecast read it instead of the option name and
  value. The starter kit's recipe variant is matched by ID or SKU, not by title.
- A full sweep of both repos (app, extensions, Functions, theme Liquid and JS) for logic that keys on
  translatable content (metafield text, product type, titles, option names and values, selling plan
  names, collection titles); every hit is fixed here or listed in this spec with the reason it is safe.
- A test in each repo that fails when logic compares against translatable text (English species or
  food type words, the `Size` option name, or `productType`).
- The walkthrough in both languages and the axe pass left open in spec 015.

**Out of scope (each planned as its own follow-up, done before other new features)**
- Hard-coded theme strings moved to locale files (`selling-plan-picker`, `guaranteed-analysis`,
  `feeding-calculator` text, `product-comparison` text): theme spec.
- Missing `refill_run_out` / `refill_variants` definitions and values: separate fix.
- Aligning the develop and published themes, so the published theme gets these changes.
- Life stage and main protein: no logic compares them (confirmed by the sweep); they stay text and are
  translated as content.
- Product type values: still merchant data, no longer read by logic.

## Acceptance criteria

- [ ] Given the `species` and `food_type` metaobject definitions, when listed by Admin API, then they
      hold exactly `dog`, `cat` and `dry`, `wet`, `treats`, each with an English label and a Spanish
      translation
- [ ] Given every product, when read by Admin API, then `custom.species` and `custom.food_type` are
      references whose handles match the previous text values (count before = count after)
- [ ] Given a Spanish buyer with dry dog food in checkout, when the checkout loads, then the Refill
      block shows (same as English)
- [ ] Given a customer with a forecast, when the reminder renders in Spanish, then "Reorder" links the
      right variant
- [ ] Given a qualifying refill order in Spanish, when the cart is evaluated, then the refill reward
      applies exactly as in English, and wet food or treats never get it
- [ ] Given a product page in Spanish, then the species icon shows and the feeding calculator defaults
      to the product's species; cards, recipe stamp and comparison show Spanish labels
- [ ] Given the collection pages in Spanish, then the species and food type filters list Spanish labels
      and filter correctly; automatic collections keep their product counts
- [ ] Given the app (forecast, health score, bulk fix, export), when run against the migrated catalog,
      then results match the pre-migration results
- [ ] Given every dry food variant, then `custom.bag_grams` matches its `Size` option, and the checkout
      block and forecast give the same result as before in English and Spanish
- [ ] The sweep table (below, filled during implementation) lists every comparison found and its
      outcome: fixed, or safe with the reason
- [ ] A test in the app and one in the theme fail if logic compares species or food type against
      English words, keys on the `Size` option name or reads `productType`
- [ ] Walkthrough in English and Spanish (home, collection, product, cart, checkout, account) with no
      broken feature; one announced axe pass on the touched pages with 0 new violations
- [ ] Access scopes unchanged (metaobject access already granted; checked before the migration)
- [ ] Every Admin GraphQL operation is typed by codegen and validated against the pinned API version
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `shopify theme check` pass

## Technical approach

- **Theme repo, `data/product-keys/seed.mjs`** (`npm run seed:product-keys`): `metaobjectDefinitionCreate`
  (`capabilities.translatable`, storefront `PUBLIC_READ`) and `metaobjectUpsert` by handle;
  `translationsRegister` for Spanish labels. Migration: read every product's old text values, delete
  the two product definitions with their values, recreate them as `metaobject_reference`
  (`metaobject_definition_id` validation, filter enabled), then `metafieldsSet` the references in
  batches of 25. A dry run prints the mapping before writing.
- **App:** one module `app/lib/catalog/product-keys.ts` with the handles (`SPECIES`, `FOOD_TYPES`) and
  a reader from `reference.handle`; every Admin query asks for the reference. `checkout-rules` writes
  `dryFoodTypeId` into `refill-reward-config` when the discount is created or saved.
- **Function `refill-reward`:** input reads `custom.food_type { value }` instead of `productType`;
  `isDryFood(foodTypeId, config.dryFoodTypeId)`.
- **Checkout block:** a line is dry food when it has a bag size, calories and a species reference
  (`gid://shopify/Metaobject/`); the contract test keeps it aligned with `orders.ts`.
- **Theme:** consumers use `.value.system.handle` for logic and `.value.label` for text.
- **Guard tests:** a Vitest test in the app scans `extensions/` and `app/lib/` for comparisons with
  `Dog`, `Cat`, `Dry`, `Wet`, `Treats` or `productType`; a Node test in the theme scans `snippets/`,
  `sections/` and `blocks/` for the same words in comparisons.
- **Owner steps:** rebuild the two Search & Discovery filters on the new definitions; production
  release (`app deploy`) and theme push as usual.
- Access scopes added: none expected (`write_metaobject_definitions` and `write_metaobjects` to confirm
  before the migration).

## Sweep results

Filled during implementation: file, what it compares, source (Admin API original or localized
surface), outcome.

| File | Compares | Source | Outcome |
|---|---|---|---|

## References

- Function input limits and `Metafield` fields: https://shopify.dev/docs/api/functions/2026-10
- Metafields for input queries: https://shopify.dev/docs/apps/build/functions/input-queries/metafields-for-input-queries
- Metaobject capabilities (translatable) and Liquid `metaobject.system`: to be confirmed in the docs
  before implementation

## Risks and open questions

- Deleting a product metafield definition deletes its values and any automatic collection or filter
  built on it: the seed reads and saves values first, and collections are listed before deleting.
- Theme settings or templates that reference the old text values (for example a calculator default)
  must be checked before the push.
- The published theme gets the theme changes only when the develop theme is aligned with it (planned
  separately); until then it keeps comparing text.
