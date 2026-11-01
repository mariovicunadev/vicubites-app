# 004 — Nutrition Data Health: B2B catalog coverage

| Field     | Value |
|-----------|-------|
| Status    | Approved |
| Branch    | `feature/004-b2b-catalog-coverage` |
| Estimate  | 4–5 h · ~2.5–3 h (AI-assisted) · ~5–6 h manual |
| Actual    | — |

## Goal

Merchants see which recipes wholesale buyers (veterinary clinics, pet shops, groomers) can't
order, because the product isn't published in any B2B catalog. It becomes a ninth health rule,
so gaps show up in the same score and list as missing nutrition data.

## Context

Vicubites sells B2C and B2B from one store. B2B buyers only see products published in the
catalog assigned to their company location: a catalog is a context (`CompanyLocationCatalog`)
with an optional publication (which products are visible) and price list. A new recipe that is
complete for pet owners can still be invisible to every clinic, and the admin has no catalog-wide
view of that. The audit already reads the whole catalog through the bulk engine
([spec 003](003-nutrition-data-health.md)); this spec adds the B2B dimension to the same run.

## Scope

**In scope**
- Catalog discovery before each audit: active company location catalogs and their publication
  IDs (`catalogs(type: COMPANY_LOCATION)`), through `adminGraphql()`.
- The catalog bulk query becomes a function of those publication IDs: one aliased
  `publishedOnPublication(publicationId:)` field per publication (`b2b_<id>`), plus
  `requiresSellingPlan`. Scalar fields with arguments: the query keeps four connections, two
  levels.
- `ProductData` gains `b2bPublished` (`boolean[]`, one per catalog checked) and
  `requiresSellingPlan`.
- Rule `b2b-catalog`, weight 10: passes when the product is published in at least one B2B
  catalog. **Not applicable** (full points) when:
  - the product requires a selling plan (B2B can't buy subscription-only products);
  - the store has no active company location catalog with a publication (availability is then
    decided by the sales channel, per the docs).
- New weights (sum 100): guaranteed analysis 20, ingredients **15** (was 20), calories 15,
  classification 15, images 10, image alt text 10, **B2B catalog 10**, search listing 5, SKUs 5.
- The Data health page shows the new rule's bar and per-product gap with no layout changes.

**Out of scope**
- Publishing products to a catalog (`write_publications`): fixes go through the admin or
  spec 005.
- B2B prices, quantity rules and volume pricing.
- Variant-level publishing (B2B catalogs can publish a subset of variants).
- Changing the demo company's catalog: it keeps its two products, so the audit shows real gaps.

## Acceptance criteria

- [ ] With the demo company's catalog (two products), those two score the B2B rule; live
      products outside it are flagged "Not in any B2B catalog"; subscription-only products pass.
- [ ] With no company location catalogs, the rule passes for every product and the bulk query
      has no `publishedOnPublication` fields.
- [ ] Tests: rule passing, failing, selling plan exemption, no catalogs; query builder (aliases,
      ID escaping, no catalogs); node parsing of `b2b_*` fields; weights add up to 100.
- [ ] Access scopes: `read_products`, `read_metaobject_definitions`, plus `read_publications`
      only if the API requires it (see Risks).
- [ ] Every Admin GraphQL operation is typed by codegen and validated against 2026-10.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass.

## Technical approach

- `app/lib/health/b2b.server.ts`: `B2B_CATALOGS_QUERY` (`#graphql` const) and
  `loadB2bPublicationIds()`. Filters `status: ACTIVE` catalogs with a non-null publication.
- `app/lib/catalog/export.ts`: `catalogQuery({ b2bPublicationIds })` builds the bulk query;
  `CATALOG_EXPORT_QUERY` stays as `catalogQuery()` for the Exports page. IDs are validated as
  `gid://shopify/Publication/<digits>` before being interpolated (bulk queries take no
  variables).
- `productFromNode()` collects every `b2b_*` key, so processing doesn't need the catalog list
  that was used to start the job (no schema change).
- `startAudit()` loads the publication IDs, then starts the bulk job with the built query.

## References

- [Product and variant publishing](https://shopify.dev/docs/apps/build/sales-channels/product-publishing)
- [CompanyLocationCatalog](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CompanyLocationCatalog)
- [catalogs query](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/catalogs)
- [Product.publishedOnPublication](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Product)
- [bulkOperationRunQuery](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/bulkOperationRunQuery)

## Risks and open questions

- **Scope.** The publishing guide lists `read_publications`; schema validation reports only
  `read_products` for both queries. Verify against the store with the current scopes first and
  add `read_publications` only if the API returns an access error.
- The average score drops when this rule lands: the demo catalog covers two products. Expected,
  and documented in the PR.
- One aliased field per catalog: fine for a handful of catalogs; a store with hundreds would
  need a different approach (per-publication product lists).
