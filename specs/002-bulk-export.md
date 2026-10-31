# 002 — Bulk export engine and catalog CSV

| Field     | Value |
|-----------|-------|
| Status    | In progress |
| Branch    | `feature/002-bulk-export` |
| Estimate  | ~4.5 h (AI-assisted) · ~8.5 h manual |
| Actual    | — |

## Goal

A reusable bulk export engine and its first use: merchants export the full catalog (products,
variants, metafields, media) to CSV from the app.

## Context

Nutrition Data Health scores the whole catalog and Refill Radar reads the whole order history.
Paginating through those with regular queries means many requests and client-side throttling.
A bulk query runs once, in the background on Shopify's side, and returns one JSONL file. The
engine is written once and both modules use it.

Facts from the 2026-10 docs that shape the design:
- Results are flat JSONL. Nested connection items are separate lines with `__parentId`;
  `groupObjects` defaults to `false` because grouping is slower and more likely to time out.
- Up to five connections, two levels deep; each connection must implement `Node`.
- `currentBulkOperation` is deprecated; use `bulkOperation(id:)`. Up to five concurrent bulk
  queries per shop.
- `url` and `partialDataUrl` expire seven days after completion.
- `bulk_operations/finish` notifies completion. Its payload uses lowercase values
  (`"completed"`, `"access_denied"`) and carries no URL or counts.

## Scope

**In scope**
- `app/lib/bulk/operations.server.ts`: `startBulkQuery()`, `getBulkOperation()`,
  `downloadBulkResult()` (decodes and reads the file as a stream).
- `app/lib/bulk/jsonl.ts`: line splitter, JSONL parser and tree assembly by `__parentId`,
  children grouped by GID resource type, independent of line order.
- `app/lib/bulk/status.ts`: status and error code unions derived from the generated enums,
  webhook value parsing, seven-day expiry.
- Prisma `BulkJob`: shop, operation ID, kind, status, error code, counts, URLs, expiry, dates.
- `app/lib/bulk/jobs.server.ts`: create, update from GraphQL or the webhook, polling fallback.
- Webhook `bulk_operations/finish` (`/webhooks/bulk_operations/finish`).
- `app/lib/catalog/export.ts`: catalog bulk query and CSV generator (one row per variant, one
  `namespace.key` column per metafield, media count and media missing alt text).
- `/app/exports`: start an export, job table with status and counts, CSV download through a
  resource route; partial CSV for failed operations with partial data; "expired" after seven days.

**Out of scope**
- Nutrition Data Health rules and scores (spec 003), bulk import, order export (Refill Radar),
  deployment.

## Acceptance criteria

- [ ] "Export catalog" starts the operation and the job moves from `CREATED` to `COMPLETED`
      without a manual reload.
- [ ] The downloaded CSV has the 20 products and all their variants, with metafields and media
      alt text.
- [x] A failed operation shows its error code and offers partial data when Shopify kept some.
- [x] An expired result explains the seven-day limit instead of failing with a generic error.
- [x] Tests: tree assembly (children before and after the parent, several child types, blank
      lines, invalid JSON), CSV escaping, status mapping, expiry and the job view.
- [x] `npm run typecheck`, `npm run lint` and `npm test` pass; bulk mutation, status query and
      catalog query validated against 2026-10.
- [x] Access scopes unchanged: `read_products`, `read_metaobject_definitions`.

## Technical approach

- Status types are template literal types over the generated enums
  (`` `${BulkOperationStatus}` `` → `"CREATED" | "RUNNING" | …`), so stored strings and webhook
  values compare without casts.
- `objectCount` and `rootObjectCount` are `UnsignedInt64` and arrive as strings; they're
  converted before they're stored.
- The webhook records status, error code and completion time. GraphQL fills in counts and the
  signed URL, through polling while a job runs or on download.
- The browser never sees the signed result URL: the download route fetches the JSONL on the
  server and streams the CSV back. The page uses `fetch` (App Bridge adds the session token)
  rather than a plain link, which wouldn't carry it inside the admin iframe.
- `ReadableStream` isn't typed as an async iterable in the DOM lib; the download reads it
  through `getReader()`.

Verified on the dev store: 462 JSONL lines (20 products, 72 variants, 312 metafields, 58 media
images) → 72 CSV rows, 30 columns.

## References

- [Perform bulk operations with the GraphQL Admin API](https://shopify.dev/docs/apps/build/apis/graphql-admin/bulk-operations/queries)
- [bulkOperationRunQuery](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/bulkOperationRunQuery)
- [BulkOperation](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/BulkOperation)
- [Webhook topics and payloads (bulk_operations/finish)](https://shopify.dev/docs/api/admin-rest/2026-10/resources/webhook)
- [Resource Fetching API (App Bridge)](https://shopify.dev/docs/api/app-home/v1.1/apis/authentication-and-data/resource-fetching-api)

## Risks and open questions

- Webhook delivery to the dev tunnel can be delayed; the page polls while a job runs.
- The tree is assembled in memory. Fine for this catalog (a few thousand objects); a very large
  export would write rows per product as soon as all its children have arrived.
- On Windows, `prisma generate` fails while `shopify app dev` holds the query engine: stop the
  dev server first.
