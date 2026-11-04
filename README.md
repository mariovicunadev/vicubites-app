# Vicubites Ops

An embedded Shopify app for **Vicubites**, a premium dog and cat food brand that sells to pet
owners (one-time and autoship) and to businesses (veterinary clinics, pet shops, groomers).
It runs inside the Shopify admin as a custom app for the brand's store.

> Vicubites is a fictional brand. The store, products and customers are demo data.

## Modules

| Module | Problem | Status |
|---|---|---|
| **Nutrition Data Health** | Pet food listings need complete nutrition data (guaranteed analysis, ingredients, feeding guide), accessible images and B2B catalog coverage. Gaps hurt search filters, SEO and wholesale buyers, and the admin has no single view of them. The module scores every product, flags what's missing and fixes it in bulk. | In development |
| **Refill Radar** | Food runs out on a predictable schedule, but one-time buyers who aren't reminded often reorder elsewhere. The module predicts each customer's run-out date from bag size and daily portion (or their real reorder cadence) and triggers reminders through Shopify Flow and Klaviyo. | In development: forecast, webhook, admin page, storefront reminder, web pixel and Klaviyo events done |

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
`read_publications` (B2B catalog coverage), `read_orders` and `write_customers` (Refill Radar
reads orders and stores the forecast on the customer), `write_pixels` and `read_customer_events`
(Refill Radar's web pixel).

**Protected customer data.** Refill Radar works on the order's customer ID (level 1). The one
level 2 field it reads is the email of a customer who is due soon, at send time, to address the
Klaviyo event; the app never stores it, so the admin page shows customers by ID and links to
them. The app uses custom distribution, which makes levels 1 and 2 available without a review. `read_orders` covers
the last 60 days of orders; a store with a longer history would add `read_all_orders`.

## Refill Radar

**Forecast.** Each dry food order (initial load from order history, then the `orders/create`
webhook) updates one forecast per customer and species: from bag size and daily portion, or from
the customer's real reorder cadence when their history shows one. The forecast is stored in the
app database and in three app-owned customer metafields (`$app.refill_run_out`,
`$app.refill_forecast`, `$app.refill_variants`), readable by the admin only.

**Storefront reminder.** A theme app extension block (`extensions/refill-radar/`) shows a
signed-in customer when each pet's food is expected to run out, the bag they last bought and a
"Reorder" button that adds that variant to the cart. Liquid reads the app-owned metafields
directly (no API call, no storefront access on the definitions). Visitors who aren't signed in,
and customers without a forecast, get no markup; a sold-out bag links to its product instead.

**Measurement in two layers.**

| Layer | Source | What it counts | Limit |
|---|---|---|---|
| Reminder funnel | Web pixel (`extensions/refill-radar-pixel/`) posting to `/pixel/refill/events` | Reminder views, "Reorder" clicks, completed checkouts after a view | A minimum, never a total: the pixel runs only with analytics consent, and content blockers block its sandbox |
| Reorders | `orders/create` webhook | Dry food reorders from returning customers | Counts every order, but doesn't know whether the customer saw the reminder |

The admin page shows both for the last 30 days. Pixel events are untrusted counts (anyone can
publish one from a browser console): never used as orders or identities, and deleted after 90
days. The reminder itself (block, "Reorder", forecast updates, Klaviyo sends) runs on Liquid and
webhooks, so blockers don't affect it; the app doesn't try to work around them.

**Klaviyo.** For every forecast due within 14 days, the app sends a `Refill Due` event through
Klaviyo's Create Event API (on each order webhook, and from "Send due reminders" on the admin
page). The event carries the customer's email and the forecast (`species`, `run_out_on`,
`days_left`, `basis`, `days_of_food`), with a `unique_id` built from customer, species and
run-out date, so a resend never duplicates the event and a new forecast creates a new one. A
Klaviyo flow triggered by the `Refill Due` metric sends the email; content and timing live in
Klaviyo, where marketing can change them without a deploy. The demo flow allows re-entry (one
email per forecast), turns off Smart Sending and adds UTM tracking. Without
`KLAVIYO_PRIVATE_KEY` the admin page shows Klaviyo as not connected and the webhook still
succeeds.

A production setup would also:
- send from the brand's own domain, authenticated with SPF, DKIM and DMARC (a free mailbox
  address as sender lands in spam);
- install Klaviyo's Shopify integration, so these events merge into profiles that carry email
  consent;
- run the due-soon check on a schedule: today a forecast that becomes due without a new order
  waits for the next manual send.

## Getting started

Requirements: Node.js 22.12+, [Shopify CLI](https://shopify.dev/docs/apps/tools/cli), a Shopify
development store.

```bash
npm install
shopify app dev          # links the app, starts a tunnel and opens it in the admin
```

Optional: `KLAVIYO_PRIVATE_KEY` in `.env` at the app root (a Klaviyo private API key with
`events:write`) turns on the Klaviyo events.

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
