# 003 — Nutrition Data Health: rules and score

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/003-nutrition-data-health` |
| Estimate  | 6–8 h · ~4 h (AI-assisted) · ~8 h manual |
| Actual    | ~3.5 h (+ ~0.5 h incident) |

## Goal

Merchants see, for every product, how complete its nutrition data is: a 0–100 score, what's
missing, and catalog-wide numbers per rule, so new recipes don't go live with gaps.

## Context

Pet food listings depend on structured data the storefront reads: the guaranteed analysis panel,
the portion calculator (kcal per kg), Search & Discovery filters (species, life stage, food type,
main protein) and the ingredient pages. No admin view shows which products are missing which
data. An audit reads the whole catalog, so it reuses the bulk export engine from
[spec 002](002-bulk-export.md).

The live catalog is complete. Demo data: five DRAFT products that arrive with different gaps, the
way recipes come in from a supplier feed. Drafts stay off the storefront.

## Scope

**In scope**
- `app/lib/health/`: rules declared as data (`id`, label, reason, weight, `check()` returning
  what's missing), weighted score, catalog summary, view model. Pure and unit tested.
- Rules and weights (sum 100): guaranteed analysis 20, ingredients 20, calories 15,
  classification 15, images 10, image alt text 10, search listing 5, SKUs 5.
- Audit pipeline: a bulk job of kind `audit` with the catalog query; when it completes, the
  result is evaluated and stored in `ProductHealth`. Processing is claimed with a conditional
  update (`processedAt`) so it runs once, and replaces the previous results in one transaction.
- `/app/health`: run audit, summary (average score, products needing attention, last audit),
  one progress bar per rule, products sorted from lowest score with what's missing, each linked
  to its admin page (`shopify://admin/products/{id}`).
- `scripts/demo/seed-incomplete-products.mjs`: five draft products through Shopify CLI store
  auth; re-runnable (`productSet` upserts by handle).

**Out of scope**
- B2B catalog coverage rule (spec 004, needs `read_publications`).
- Bulk fix through `bulkOperationRunMutation` (spec 005).
- Admin UI extension block on the product page (spec 006).

## Acceptance criteria

- [x] The 20 live products score 100; the five drafts score 15, 50, 65, 85 and 90 with the right
      rules flagged.
- [x] Tests: each rule passing and failing, weighted score, summary, edge cases (no variants,
      blank values, `[]` ingredient list, malformed list), weights add up to 100.
- [x] `npm run typecheck`, `npm run lint` and `npm test` pass.
- [x] App access scopes unchanged: `read_products`, `read_metaobject_definitions`.

## Technical approach

- `RULES` is `as const satisfies readonly HealthRule[]`: checked against the interface while
  keeping literal IDs, so `RuleId` is the union of the declared IDs.
- Results are stored as JSON text (SQLite has no JSON column) and parsed on read.
- The exports page now lists `catalog` jobs only; audits are `audit` jobs.
- The seed checks values against the store's metafield definitions, which restrict species,
  life stage, food type and main protein to fixed choices.

## Incident during implementation

The first version of the seed passed the CDN URL of a live product's image to `productSet`.
Shopify linked that existing file instead of copying it, and alt text lives on the file: the
drafts rewrote the alt text of *Puppy Chicken & Oat Recipe*'s first image to empty. The first
audit flagged it (that product scored 90).

Fix: `fileUpdate` restored the alt text and removed the drafts' references to the file
(`referencesToRemove`, which detaches without deleting). The seed now uploads its own copy of
the image per product through staged uploads. Verified: the live product has its three images
with alt text, and each draft has its own files.

## References

- [productSet](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/productSet)
- [FileUpdateInput](https://shopify.dev/docs/api/admin-graphql/2026-10/input-objects/FileUpdateInput)
- [Navigation API: admin links](https://shopify.dev/docs/api/app-home/v1.1/apis/user-interface-and-interactions/navigation-api)

## Risks and open questions

- Scores depend on metafield keys from the theme project; a renamed key would show as missing
  everywhere. The rules list the keys in one place.
- An audit replaces all results at once. History over time would need a snapshot table.

## Verification

Audit from the app on the dev store, after the incident fix: 25 products, average score 92,
5 needing attention. Drafts: Kitten Turkey 15, Grain-Free Beef 50, Senior Salmon Pâté 65,
Freeze-Dried Liver Bites 85, Large Breed Puppy Lamb 90. All 20 live products score 100.
