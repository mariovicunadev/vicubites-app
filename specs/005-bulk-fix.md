# 005 — Nutrition Data Health: bulk fix from a spreadsheet

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/005-bulk-fix` |
| Estimate  | 5–6 h · ~4–5 h (AI-assisted) · ~9–11 h manual |
| Actual    | ~1.5 h |

## Goal

Merchants fix missing nutrition data for many products at once: download a spreadsheet of the
gaps, fill it in with the manufacturer's values, upload it, review what will change, apply, and
see the result for every product.

## Context

The audit ([spec 003](003-nutrition-data-health.md), [004](004-b2b-catalog-coverage.md)) shows
what's missing; fixing it one product page at a time doesn't scale to a supplier feed of new
recipes. Values must come from the manufacturer (guaranteed analysis is printed on the label),
so the app doesn't generate them: it moves them from a spreadsheet into the catalog safely.

Writing hundreds of products with one call per product hits rate limits and stops halfway with
no record of what was applied. A bulk mutation runs in the background on Shopify's side and
returns one result per input line. It reuses the bulk engine from
[spec 002](002-bulk-export.md) (jobs, webhook, polling).

## Scope

**In scope**
- **Fields**: guaranteed analysis (`custom.protein_min`, `fat_min`, `fiber_max`,
  `moisture_max`, `number_decimal`), calories (`custom.kcal_per_kg`, `number_integer`) and
  classification (`custom.species`, `life_stage`, `food_type`, `main_protein`, single line text
  with fixed choices).
- **Template CSV** (`/app/health/fix/template`): one row per product that fails one of those
  rules in the latest audit; columns `product_id`, `handle`, `title` and the nine fields, filled
  with current values (read with `nodes(ids:)`).
- **Upload and preview** (`/app/health/fix`): the CSV is parsed on the server (max 1 MB) and
  validated before anything is written: known product IDs, numbers for numeric fields, values
  from the store's metafield definitions for choice fields (read at preview time, not
  hard-coded). The preview lists, per product, current → new value; blank cells mean "no
  change"; rows with errors are shown and skipped.
- **Apply**: one JSONL line per product with its changes (`metafieldsSet`, up to 25 metafields
  per call; at most nine here), uploaded through `stagedUploadsCreate`
  (`BULK_MUTATION_VARIABLES`), then `bulkOperationRunMutation`. Tracked as a `BulkJob` of kind
  `fix`; one fix at a time per shop.
- **Results**: when the job completes, the result file is read line by line and joined to the
  products through `__lineNumber`: applied, or the `userErrors` Shopify returned for that line.
  Shown on the same page with a link to run a new audit.
- `FixRun` Prisma model: the job, the planned lines (product, title, changes) and the results.
- Access scope added: `write_products` (required by `metafieldsSet` on products).

**Out of scope**
- Ingredients (metaobject references: the sheet would need handles resolved to IDs), SEO title
  and description (`productUpdate`, a different mutation), image alt text (lives on shared
  files), SKUs.
- Clearing a value (blank means no change).
- Generating values automatically.
- Undo. The preview is the safety net; a later spec could store previous values for rollback.

## Acceptance criteria

- [x] The template lists only products failing guaranteed analysis, calories or classification,
      with current values filled in.
- [x] A CSV with invalid numbers, unknown choices, unknown product IDs or unknown columns shows
      those errors in the preview and nothing is written for those rows.
- [x] Applying a valid CSV to the demo drafts updates their metafields; each product shows
      "applied" or the error Shopify returned; a new audit raises their scores.
- [x] The JSONL and the preview never include products or fields that aren't in the CSV.
- [x] Tests: CSV parser (quotes, commas, line breaks, BOM, CRLF), validation, change plan,
      JSONL lines, result join by `__lineNumber` (success, `userErrors`, top-level `errors`,
      missing lines).
- [x] Access scopes: `read_products`, `write_products`, `read_metaobject_definitions`,
      `read_publications`.
- [x] Every Admin GraphQL operation is typed by codegen and validated against 2026-10.
- [x] `npm run typecheck`, `npm run lint`, `npm test` (76 tests) and `react-router build` pass.

## Technical approach

- `app/lib/fix/` (pure, unit tested): `csv-parse.ts` (RFC 4180 parser), `fields.ts` (the nine
  fields and their types), `plan.ts` (rows + current values + definitions → per-product changes
  and errors), `jsonl.ts` (plan → `metafieldsSet` variables per line), `results.ts`
  (result lines + plan → per-product outcome).
- `app/lib/fix/run.server.ts`: template data, preview (`nodes(ids:)` for current values,
  `metafieldDefinitions` for choices), staged upload (multipart POST to the signed target; the
  `key` parameter is the `stagedUploadPath`), `bulkOperationRunMutation`, result processing
  claimed with `processedAt` like audits.
- `app/lib/bulk/operations.server.ts`: `startBulkMutation()` next to `startBulkQuery()`; a flat
  result reader (mutation results have no `__parentId` tree).
- The webhook and polling already cover any bulk operation; `BulkJobKind` gains `fix`.

## References

- [Bulk import data with the GraphQL Admin API](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/imports)
- [bulkOperationRunMutation](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/bulkOperationRunMutation)
- [stagedUploadsCreate](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/stagedUploadsCreate)
- [metafieldsSet](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldsSet)
- [BulkMutationUserError](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/BulkMutationUserError)

## Risks and open questions

- First write scope in the app: the preview is mandatory before apply, and only fields in the
  list above can be written.
- Values in the CSV may change between preview and apply (another staff member edits a
  product). Apply uses the plan from the preview; the results show what Shopify accepted.
- The demo seed may not restore the drafts' gaps after a fix (`productSet` doesn't remove
  metafields it doesn't list); resetting demo data could need a cleanup step.

## Issues found during implementation

- **Metafield keys.** On the same product, `metafields(keys: [...])` returns `key` prefixed with
  the namespace (`custom.species`) and `metafields(namespace:)` returns the bare key
  (`species`). `metafieldKey()` accepts both; found while building demo data from the live API.
- **Generated enums** are declarations without a runtime value, so the staged upload input is
  written as literals in the operation (it never changes).
- **Server-only import.** The page imported the upload size limit from `run.server.ts`; React
  Router strips `.server` modules from the client bundle and the page failed to load. The limit
  moved to `csv-parse.ts`. Typecheck doesn't catch this; `react-router build` does, so it is now
  part of the checks before testing in the store.

## Verification

On the dev store, with a CSV covering the five demo drafts: the preview listed three products
to change, skipped the row with main protein "Duck" (not one of the store's choices) and counted
one row as unchanged. Applied as a bulk mutation (3 lines): 3 applied, 0 failed. A new audit
moved Kitten Turkey 15 → 60, Grain-Free Beef 45 → 65 and Senior Salmon Pâté 60 → 85; average
84 → 87. Guaranteed analysis, calories and classification now pass for 25 of 25 products.
