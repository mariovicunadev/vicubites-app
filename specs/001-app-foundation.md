# 001 — App foundation and typed Admin GraphQL layer

| Field     | Value |
|-----------|-------|
| Status    | In progress |
| Branch    | `feature/001-app-foundation` |
| Estimate  | ~3.5 h (AI-assisted) · ~6.5 h manual |
| Actual    | — |

## Goal

An embedded app for the Vicubites store that runs inside the Shopify admin and gives the two
planned modules (Nutrition Data Health and Refill Radar) a shared, typed and tested base for
Admin API work.

## Context

Both modules need a backend: they read the whole catalog or order history, react to webhooks and
render in app-only surfaces. This spec sets up that backend from Shopify's React Router app
template, pins the API version and adds the layer every later feature uses to call the Admin
GraphQL API.

## Scope

**In scope**
- App scaffolded from the official React Router template (TypeScript), embedded, sessions stored
  with Prisma (SQLite in development).
- TypeScript `strict: true`; Admin API version pinned to `2026-10` in the app, codegen and
  webhook configuration.
- Least-privilege access scopes; template demo resources removed (demo product metafield,
  example metaobject definition, product price-change event and its route, extra page).
- GraphQL codegen with `@shopify/api-codegen-preset`; generated types committed.
- `app/lib/admin/`: `adminGraphql()` returns typed `data` and normalizes failures into
  `AdminApiError` (`graphql`, `user-errors`, `empty-response`); `assertNoUserErrors()` for
  mutation payloads.
- Home page (Polaris web components): product count, Ingredient entries, shop and API version;
  error banner when the query fails.
- Vitest with unit tests for the error layer, the GraphQL helper and count formatting.
- README, `CLAUDE.md` and spec template.

**Out of scope**
- Bulk operations engine (spec 002), Nutrition Data Health rules (spec 003).
- Webhooks beyond the template's `app/uninstalled` and `app/scopes_update`, extensions,
  deployment and CI.

## Acceptance criteria

- [ ] `shopify app dev` opens the app inside the Vicubites admin without console errors.
- [ ] The home page shows the store's real product count and Ingredient entries.
- [x] `npm run graphql-codegen`, `npm run typecheck`, `npm run lint` and `npm test` pass.
- [x] A field that doesn't exist on the schema fails codegen; reading a field the query didn't
      select fails the typecheck.
- [x] A thrown `Response` (re-authentication redirect) passes through the error layer untouched.
- [x] Access scopes: `read_products`, `read_metaobject_definitions`.

## Technical approach

- `shopify.app.toml`: scopes, webhook `api_version = "2026-10"`, demo definitions removed.
- `app/shopify.server.ts`, `.graphqlrc.ts`: `ApiVersion.October26`.
- `app/lib/admin/errors.ts`: `AdminApiError` and pure helpers. GraphQL errors are read from
  `GraphqlQueryError.body.errors.graphQLErrors` (thrown by `@shopify/shopify-api` on HTTP 200
  responses with errors) without importing the class.
- `app/lib/admin/graphql.server.ts`: `adminGraphql(admin.graphql, QUERY, { variables })`, typed
  through `AdminOperations` from `@shopify/admin-api-client`, which codegen augments.
- `app/lib/format.ts`: `formatCount()` for `Count` results (`AT_LEAST` → "10,000+").
- `app/routes/app._index.tsx`: `shopOverview` query. `metaobjectDefinitionByType` needs
  `read_metaobject_definitions` (reported by the schema validator), not `read_metaobjects`.
- `tsconfig.json`: `@shopify/app-bridge-react` in `types`, so App Bridge elements (`s-app-nav`)
  are typed explicitly instead of through a side-effect import.
- `vitest.config.ts`: separate from `vite.config.ts` (no React Router plugin in unit tests).
- `npm run lint` skips `app/types/` (generated).

## References

- [Shopify App package for React Router](https://shopify.dev/docs/api/shopify-app-react-router)
- [Typing GraphQL operations](https://shopify.dev/docs/api/shopify-app-react-router/v4/guide-graphql-types)
- [Migrate from Polaris React to Polaris web components](https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react)
- [About app distribution](https://shopify.dev/docs/apps/launch/distribution)
- [Access scopes](https://shopify.dev/docs/api/usage/access-scopes)

## Risks and open questions

- The distribution method (custom) can't be changed once selected. It's set in the Dev Dashboard
  before Refill Radar requests protected customer data, and `AppDistribution` in
  `shopify.server.ts` is aligned then.
- Windows: the `shopify app dev` tunnel and `prisma generate` are the usual failure points.
