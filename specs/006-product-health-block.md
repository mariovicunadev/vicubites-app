# 006 — Nutrition Data Health: block on the product page

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/006-product-health-block` |
| Estimate  | 4 h · ~2.5–3.5 h (AI-assisted) · ~6–8 h manual |
| Actual    | ~1 h |

## Goal

Merchants see a product's nutrition data score and exactly what's missing while they edit the
product, without opening the app. The score is computed live, so it reflects the last save.

## Context

The audit ([spec 003](003-nutrition-data-health.md), [004](004-b2b-catalog-coverage.md)) scores
the whole catalog in one bulk operation, and the bulk fix ([spec 005](005-bulk-fix.md)) fills
gaps from a spreadsheet. Day-to-day, though, data is entered one product at a time on the
product page, where the merchant can't see the rules. An admin block puts the checklist where
the work happens.

The block can't score the product itself: the rules, weights and B2B catalog check live in the
app, and they must give the same answer in the block and on the Data health page. So the block
asks the app's backend, which reads the product, scores it with the same `evaluateProduct` and
refreshes that product's row in the audit results.

## Scope

**In scope**
- Admin UI extension `nutrition-health-block`, target `admin.product-details.block.render`
  (Preact + Polaris web components, API 2026-10). The merchant adds and pins it.
- Block content: score badge with the same tones as the Data health page, the failed rules with
  what each one is missing, a "Check again" button, a link to Data health, and loading, error
  and "all complete" states.
- Backend route `GET /api/health/:productId`: authenticated with `authenticate.admin` (ID token
  sent by the extension), CORS via the library's `cors` helper, reads the product live, scores
  it, upserts its `ProductHealth` row, returns the result as JSON.

**Out of scope**
- Editing metafields from the block (the product page already has the fields).
- Rescoring on every product save (`products/update` webhook).
- Translations (the app is English-only for now).

## Acceptance criteria

- [x] Given a pinned block on a product page, when it loads, then it shows the product's score
      and every failed rule with its missing items, computed from the product's current data.
      Verified: draft demo product 60 (4 rules missing), live product 90 (B2B catalog only).
- [x] Given the merchant fills a field and saves, when they click "Check again", then the score
      updates without reloading the page. Verified: "Check again" re-reads the product; a
      field change wasn't made on the demo product.
- [x] Given a product with every rule passing, then the block shows 100 and an "all complete"
      message instead of the list. No product scores 100 in the store yet; the empty-issues
      branch is the same `toHealthRow` output the Data health page uses.
- [x] Given the backend can't be reached or fails, then the block shows an error with a retry,
      not a blank card. Verified while the dev server was rebuilding.
- [x] After a live check, the Data health page shows the product's new score (same rules, same
      weights, B2B catalog check included).
- [x] The block links to the Data health page inside the app.
- [x] Requests without a valid ID token are rejected; the route only reads the product of the
      shop in the token.
- [x] Access scopes: none added (`read_products`, `read_publications` already cover the query).
- [x] Every Admin GraphQL operation is typed by codegen and validated against the pinned API version
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass

## Technical approach

- **Extension** (`extensions/nutrition-health-block/`, scaffolded with
  `shopify app generate extension --template admin_block`): reads `shopify.data.selected[0].id`,
  calls `fetch("/api/health/<numeric id>")`. Relative URLs resolve against the app URL and the
  admin adds the `Authorization` header with an ID token automatically. Rule labels come from
  the backend, so the extension holds no rule logic.
- **Route** `app/routes/api.health.$productId.tsx` (resource route, loader only):
  `authenticate.admin(request)` answers the CORS preflight and verifies the token; the response
  goes through `cors()`. Loader writes the product's cached row: an idempotent refresh, same
  data a full audit would store.
- **`app/lib/health/live.ts`** (pure, tested): `productFromGraphql()` maps the single-product
  query result to `ProductData`, the same shape `productFromNode()` builds from the bulk export.
  B2B coverage: `resourcePublicationsV2(onlyPublished: true)` compared with the active B2B
  catalog publications (`loadB2bPublicationIds()` from spec 004).
- **`app/lib/health/live.server.ts`**: the typed `productHealthData` query and the
  `ProductHealth` upsert. A product the last audit didn't include (created since) gets a row
  tied to that audit; with no audit yet, the result is returned but not stored.
- Response: `toHealthRow()` from `view.ts` (score, tone, issues with labels) plus `checkedAt`.

Access scopes added: none.

## References

- Admin UI extensions (2026-10): https://shopify.dev/docs/api/admin-extensions/2026-10
- Standard API, `auth.idToken()`: https://shopify.dev/docs/api/admin-extensions/2026-10/target-apis/core-apis/standard-api
- Connect UI extensions to your app's backend: https://shopify.dev/docs/apps/build/admin/actions-blocks/connect-app-backend
- `Product.resourcePublicationsV2`: https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Product

## Risks and open questions

- Connections capped at 250 (variants, metafields, media, publications); the demo catalog is
  far below that. Products above it would score on the first 250.
- The block shows the last *saved* data: unsaved edits on the page aren't scored.
- While the dev server rebuilds (for example after a lockfile change), responses come back
  without CORS headers and the browser only reports "Failed to fetch". The block shows that as
  "couldn't be reached" with a retry.
