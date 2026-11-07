# Vicubites Ops

An embedded Shopify app for **Vicubites**, a premium dog and cat food brand that sells to pet
owners (one-time and autoship) and to businesses (veterinary clinics, pet shops, groomers).
It runs inside the Shopify admin as a custom app for the brand's store.

> Vicubites is a fictional brand. The store, products and customers are demo data.

## Modules

| Module | Problem | Status |
|---|---|---|
| **Nutrition Data Health** | Pet food listings need complete nutrition data (guaranteed analysis, ingredients, feeding guide), accessible images and B2B catalog coverage. Gaps hurt search filters, SEO and wholesale buyers, and the admin has no single view of them. The module scores every product, flags what's missing and fixes it in bulk. | In development |
| **Refill Radar** | Food runs out on a predictable schedule, but one-time buyers who aren't reminded often reorder elsewhere. The module predicts each customer's run-out date from bag size and daily portion (or their real reorder cadence) and triggers reminders through Shopify Flow and Klaviyo. | In development: forecast, webhook, admin page, storefront reminder, web pixel, Klaviyo events and Flow trigger done |

B2B accounts also reach the sales team's CRM: companies and their contacts are kept in sync with
HubSpot (see [B2B CRM](#b2b-crm-hubspot)).

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
- [Prisma](https://www.prisma.io/) with Postgres ([Neon](https://neon.com/)) for sessions and app data
- Hosted on [Vercel](https://vercel.com/) (serverless functions)
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
them. The B2B sync reads company contacts' emails the same way, at sync time, and keeps contacts
by their Shopify ID. The app uses custom distribution, which makes levels 1 and 2 available without a review. `read_orders` covers
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
Klaviyo's Create Event API (on each order webhook, when an initial load or "Rebuild from orders"
finishes, and from "Send due reminders" on the admin page). The event carries the customer's email and the forecast (`species`, `run_out_on`,
`days_left`, `basis`, `days_of_food`), with a `unique_id` built from customer, species and
run-out date, so a resend never duplicates the event and a new forecast creates a new one. A
Klaviyo flow triggered by the `Refill Due` metric sends the email; content and timing live in
Klaviyo, where marketing can change them without a deploy. The demo flow allows re-entry (one
email per forecast), turns off Smart Sending and adds UTM tracking. Without
`KLAVIYO_PRIVATE_KEY` the admin page shows Klaviyo as not connected and the webhook still
succeeds.

**Shopify Flow.** The same due-soon forecasts fire the app's `Refill due` Flow trigger
(`extensions/refill-due-trigger/`), with the customer and the forecast (species, run-out date,
days left, basis) as typed fields. Staff build their own workflows on it (the demo tags the
customer `refill-due`) without a deploy. The trigger carries no personal data: Flow reads
anything else about the customer itself. Klaviyo and Flow are separate channels, each recorded
and deduplicated on its own (customer, species, run-out date), so an outage in one never blocks
the other, and Flow works without Klaviyo.

A production setup would also:
- send from the brand's own domain, authenticated with SPF, DKIM and DMARC (a free mailbox
  address as sender lands in spam);
- install Klaviyo's Shopify integration, so these events merge into profiles that carry email
  consent;
- run the due-soon check on a schedule: today a forecast that becomes due without a new order
  waits for the next manual send.

## B2B CRM (HubSpot)

B2B companies and their contacts are pushed to HubSpot CRM, one way (Shopify → HubSpot):

- **When:** on `companies/create`, `companies/update`, `company_contacts/create` and
  `company_contacts/update` webhooks, and from "Sync B2B to HubSpot" on the B2B CRM admin page
  (initial load).
- **How:** companies are upserted by a unique `shopify_company_id` property (created by the app
  on first sync), contacts by email, then each contact is associated with its company. Upserts
  and default associations are idempotent, so a replayed webhook or a second sync creates no
  duplicates. Requests use HubSpot's date-versioned CRM API and retry `429` and `5xx`.
- **What:** the company name, its Shopify ID and each contact's email, nothing else (no
  addresses, phones, orders or prices).
- **Auth:** a private HubSpot app (`hubspot/`, developer platform project with static auth and
  private distribution) issues the access token. Without `HUBSPOT_ACCESS_TOKEN` the page shows
  HubSpot as not connected and the webhooks succeed without calling HubSpot.

Deletions and HubSpot → Shopify changes are out of scope.

## Production

```
Shopify admin / storefront / webhooks
        │ HTTPS
        ▼
Vercel (iad1) ── React Router app as Vercel Functions
        │ pooled connection (PgBouncer)
        ▼
Neon Postgres (aws-us-east-1) ── branch `production`; local development uses branch `dev`
```

Only the backend is hosted: the embedded admin, webhooks, the pixel endpoint and the Klaviyo,
Flow and HubSpot calls. The theme, the theme app extension and the web pixel run on Shopify.

**Why serverless fits.** Every task starts from a request (an admin page, a webhook, a pixel
event); nothing runs in the background, so functions that scale to zero cover the app. Both
free tiers pause instead of billing when a limit is reached.

**Build.** `react-router.config.ts` applies the `@vercel/react-router` preset only when Vercel
builds (`VERCEL=1`): routes become Vercel Functions. Any other build is a single Node server
(`npm start`, or the `Dockerfile` on a container host). `npm run build` runs `prisma generate`
first.

**Database.** The app connects through Neon's pooled URL (`DATABASE_URL`), so many short-lived
functions share a few connections; migrations use the direct URL (`DATABASE_URL_UNPOOLED`),
because they need a full session. Both end in `connect_timeout=15`, which covers Neon waking from
scale to zero. Migrations run from the deploy procedure, never during the build.

**Environment variables (Vercel, Production).** `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
`SCOPES`, `SHOPIFY_APP_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `KLAVIYO_PRIVATE_KEY`,
`HUBSPOT_ACCESS_TOKEN`. Values are pasted without quotes. A change needs a redeploy.

**Deploy procedure.**

1. Merge to `main`; Vercel builds and deploys the production branch.
2. If the schema changed: `npx prisma migrate deploy` with the production URLs in the
   environment.
3. If the app configuration or extensions changed: `shopify app deploy`.
4. After a development session on the dev store: `shopify app dev clean` (or "Clean dev
   preview" in the admin's Dev Console). Until then the store keeps the development preview,
   which points the app at a tunnel that no longer exists.

**First release on a store.** A database starts empty: open the app (token exchange stores the
session), run "Rebuild from orders" on Refill Radar (it also sends any due reminders) and "Sync
B2B to HubSpot". Shop data itself lives in Shopify. Flow workflows built on the `Refill due`
trigger during a development preview keep listening to the preview trigger: select the trigger
again in the workflow after the first deploy.

**Known issue.** In production the web pixel doesn't post events yet: the pixel loads with the
production endpoint and analytics consent, but no request reaches `/pixel/refill/events`. The
same code recorded views, clicks and checkouts during development. Reorders are still counted by
the `orders/create` webhook; only the reminder funnel figures are missing.

## Getting started

Requirements: Node.js 22.12+, [Shopify CLI](https://shopify.dev/docs/apps/tools/cli), a Shopify
development store, a Postgres database (a Neon branch works).

In `.env` at the app root:

- `DATABASE_URL`: pooled Postgres URL; `DATABASE_URL_UNPOOLED`: direct URL, for migrations.

```bash
npm install
npx prisma migrate deploy  # create the tables
shopify app dev            # links the app, starts a tunnel and opens it in the admin
```

Optional, in the same `.env`:

- `KLAVIYO_PRIVATE_KEY`: a Klaviyo private API key with `events:write`; turns on the Klaviyo
  events.
- `HUBSPOT_ACCESS_TOKEN`: the static token of the private HubSpot app in `hubspot/` (company and
  contact scopes); turns on the B2B sync.

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
- Continuous integration: GitHub Actions runs typecheck, lint, tests and the production build on
  every push and pull request to `develop` and `main` (`.github/workflows/ci.yml`). External APIs
  are mocked in tests, so CI needs no secrets.
- Current Shopify documentation is the source of truth; GraphQL operations are validated against
  the pinned API version before they're committed.
