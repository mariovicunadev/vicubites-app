# Vicubites Ops

An embedded Shopify app for **Vicubites**, a premium dog and cat food brand that sells to pet
owners (one-time and autoship) and to businesses (veterinary clinics, pet shops, groomers).
It runs inside the Shopify admin as a custom app for the brand's store.

> Vicubites is a fictional brand. The store, products and customers are demo data.

## Modules

| Module | Problem | Status |
|---|---|---|
| **Nutrition Data Health** | Pet food listings need complete nutrition data (guaranteed analysis, ingredients, feeding guide), accessible images and B2B catalog coverage. Gaps hurt search filters, SEO and wholesale buyers, and the admin has no single view of them. The module scores every product, flags what's missing and fixes it in bulk. | In development |
| **Refill Radar** | Food runs out on a predictable schedule, but one-time buyers who aren't reminded often reorder elsewhere. The module predicts each customer's run-out date from bag size and daily portion (or their real reorder cadence) and triggers reminders through Shopify Flow and Klaviyo. | Planned |

### Why an app

Both modules need what a theme or the admin can't provide on their own: a backend that works on
the whole catalog or order history, reacts to webhooks, stores its own data and renders in
app-only surfaces (admin blocks, customer account pages, Flow triggers). The app computes;
Flow, Klaviyo and HubSpot deliver.

## Stack

- [React Router 7](https://reactrouter.com/) app template with
  [`@shopify/shopify-app-react-router`](https://shopify.dev/docs/api/shopify-app-react-router)
  (embedded auth with token exchange, App Bridge)
- [Polaris web components](https://shopify.dev/docs/api/app-home) for the admin UI
- [Prisma](https://www.prisma.io/) for sessions and app data (SQLite in development)
- TypeScript `strict`, Admin GraphQL types generated with
  [`@shopify/api-codegen-preset`](https://shopify.dev/docs/api/shopify-app-react-router/v4/guide-graphql-types)
- [Vitest](https://vitest.dev/) for unit tests
- Admin API version **2026-10**

## Architecture

```
app/
├── lib/                  # business logic, pure and unit tested
│   ├── admin/
│   │   ├── graphql.server.ts   # adminGraphql(): typed data, normalized errors
│   │   └── errors.ts           # AdminApiError, assertNoUserErrors()
│   └── format.ts
├── routes/               # thin routes: authenticate → app/lib → render
├── types/                # generated Admin API types (committed)
└── shopify.server.ts     # app config: API version, session storage
specs/                    # one spec per feature, written before the code
```

**Typed Admin API calls.** Every operation is a `#graphql`-tagged constant. Codegen validates it
against the 2026-10 schema and generates its result and variables types, so a misspelled field
fails `npm run graphql-codegen`, and reading a field the query didn't select fails the
typecheck.

```ts
const { shop, productsCount } = await adminGraphql(admin.graphql, SHOP_OVERVIEW_QUERY);
//      ^ Pick<Shop, "name" | "myshopifyDomain">
```

**One error shape.** `adminGraphql()` turns every failure into an `AdminApiError` with a `kind`
(`graphql`, `user-errors`, `empty-response`), the operation name and the details Shopify
returned. Re-authentication redirects (a thrown `Response`) pass through untouched.

**Least privilege.** Each feature adds only the access scopes it needs. Current scopes:
`read_products`, `write_products` (bulk fixes of nutrition metafields), `read_metaobject_definitions`,
`read_publications` (B2B catalog coverage).

## Getting started

Requirements: Node.js 22.12+, [Shopify CLI](https://shopify.dev/docs/apps/tools/cli), a Shopify
development store.

```bash
npm install
shopify app dev          # links the app, starts a tunnel and opens it in the admin
```

| Script | What it does |
|---|---|
| `npm run dev` | `shopify app dev` |
| `npm run graphql-codegen` | Regenerate Admin API types after changing an operation |
| `npm run typecheck` | React Router typegen + `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run deploy` | Release app configuration and extensions |

## Development workflow

- Spec-driven: each feature starts as `specs/NNN-name.md` with goal, scope, acceptance criteria
  and an estimate, and closes with the actual time.
- GitFlow: `main` (released), `develop` (integration), `feature/NNN-name` per spec; every merge
  goes through a pull request with a self-review.
- Current Shopify documentation is the source of truth; GraphQL operations are validated against
  the pinned API version before they're committed.
