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
HubSpot (see [B2B CRM](#b2b-crm-hubspot)), and two checkout rules built as Shopify Functions
reward on-time reorders and cap retail quantities (see
[Checkout rules](#checkout-rules-shopify-functions)). A starter kit for new customers is built two ways, as a native fixed
bundle and as a Cart Transform Function (see
[Starter kit bundles](#starter-kit-bundles-native-vs-cart-transform)).

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
(Refill Radar's web pixel), `write_discounts` and `write_validations` (checkout rules),
`write_cart_transforms` (starter kit bundles).

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
| Reminder funnel | Web pixel (`extensions/refill-radar-pixel/`) posting to `/pixel/refill/events` | Reminder views, "Reorder" clicks, completed checkouts after a view | A minimum, never a total: the pixel runs only with analytics consent, and content blockers or network-level tracker filters block its sandbox |
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

**In checkout and customer accounts.** Two UI extensions bring the forecast to the places where
a customer decides:

| Extension | Target | What it does |
|---|---|---|
| `extensions/refill-checkout/` | `purchase.checkout.block.render` | When the cart holds dog or cat dry food, explains the reminder and shows a "Remind me before this food runs out" checkbox. The choice is written to the `$app.refill_reminders` cart metafield. |
| `extensions/refill-account/` | `customer-account.page.render` | A "Refill Radar" page in the customer account: one card per species with days left, run-out date and a "Reorder the same bag" cart link, plus whether reminders are on. |

Reminders are on unless the customer turns them off. The checkbox starts from the choice made
in this checkout, then the signed-in customer's saved choice, then on. It writes only when the
customer changes it. The order metafield definition is `cart_to_order_copyable`, so Shopify copies
the cart value to the order. The `orders/create` webhook stores it per customer (latest order
wins) in the app database and in the `$app.refill_reminders` customer metafield. Customers who
opted out get no Klaviyo event and no Flow trigger, and the admin page counts them.

Both extensions are rendering only. The checkout block reads product metafields through
`appMetafields`, and the account page reads the customer's two metafields through the Customer
Account API. Neither has network access or calls the app backend. The dry food rule and the
forecast format are duplicated in the extensions, with contract tests in the app that keep both
copies in sync.

| Scope | Why |
|---|---|
| `write_orders` | Required to own an `$app` order metafield definition. The app never edits orders. |
| `customer_read_customers` | Customer Account API, so the account page can query `customer`. Read-only, and limited to the signed-in customer. |

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

## Checkout rules (Shopify Functions)

Two rules run on Shopify's servers, inside cart and checkout, as Shopify Functions written in
TypeScript (compiled to WebAssembly). The admin page `/app/checkout-rules` creates each rule and
edits its settings, which live in an `$app` JSON metafield on the rule. The Function reads that
metafield on every run, so a change applies without a deploy.

| Rule | Function API | What it does |
|---|---|---|
| **Refill reward** (`extensions/refill-reward`) | Discount (`cart.lines.discounts.generate.run`, class `PRODUCT`) | Takes `percentage` (default 10 %) off dry food for a signed-in retail customer whose Refill Radar run-out date is within `windowDays` (default 14) of today, before or after it. Combines with order and shipping discounts. |
| **Order limit** (`extensions/order-limit`) | Cart and Checkout Validation (`cart.validations.generate.run`) | Blocks a retail checkout holding more than `maxPerVariant` (default 6) units of one variant, adding up the variant across lines, with a message that names the product and points to a business account. |

**Why Functions.** The reward depends on the app's own data (the run-out date Refill Radar keeps
on the customer) compared with the store's date at the moment of checkout, which a Function reads
live. Native quantity rules exist only on B2B catalogs. A Function also runs for express checkouts
(Shop Pay, Apple Pay), where a theme check never runs.

**Rules worth knowing:**

- **Dry food is a product type** (`Dry Dog Food`, `Dry Cat Food`). Wet food and treats carry
  `custom.kcal_per_kg` too, so that metafield can't tell them apart.
- **Subscription lines are left out** of the reward (`sellingPlanAllocation`): they already get
  the plan's discount and renew without a reorder. An automatic discount would apply to the
  first order only anyway.
- **B2B buyers are left out** of both rules (`purchasingCompany`): their catalog sets their prices
  and quantity rules.
- **The limit runs at checkout steps only** (`buyerJourney.step`). In the online store cart, a
  validation error makes the Ajax Cart API reject every change with a 422, removals included, so
  a cart already over the limit (built while signed in as B2B) could never be fixed. Errors
  target the whole cart (`$.cart`), the only cart-level target the reference documents.
- **Both fail safe.** Missing or invalid settings mean no discount and no error. The validation
  is created with `blockOnFailure: false`: if the Function itself fails, checkout stays open.

**Instruction budget.** A Function may run up to 11 million instructions. Measured with
`shopify app function run` on carts of 5, 50 and 200 lines (the most a Function sees in full):

| Function | 5 lines | 50 lines | 200 lines |
|---|---|---|---|
| Refill reward | 0.58 M | 2.17 M | 7.45 M (68 %) |
| Order limit | 0.36 M | 1.88 M | 6.73 M (61 %) |

About half the cost is parsing the input, so every field in the input query is paid for on every
line. The logic walks the lines in plain loops with no intermediate arrays: a first version of
the order limit built with `flatMap` and a `Map` cost 9.1 M at 200 lines.

Both Functions have unit tests that call them with typed input fixtures, and a contract test
checks that every value the admin page saves is accepted by the Function that reads it.

## Starter kit bundles (native vs. Cart Transform)

Two starter kits for new retail customers, each built on a different Shopify bundle model, so the
store shows both side by side.

| Kit | Model | How it's built |
|---|---|---|
| **Dog Starter Kit** (Adult Chicken & Brown Rice 2 kg + Training Treats, Chicken) | Native fixed bundle | `productVariantRelationshipBulkUpdate` links the kit variant to its two components with `priceInput: { calculation: FIXED }`. Shopify expands it, takes stock from the components and needs no code at checkout. |
| **Cat Starter Kit** (any dry cat food recipe, 1.5 kg + any Crunchy Treats flavor) | Customized bundle, Cart Transform Function (`extensions/starter-kit-expand`) | The buyer picks a recipe and a treat flavor on the product page; a Function expands the kit line into those two products at the kit price. |

**Why a Function for the cat kit.** A fixed bundle has one component list per variant: 6 recipes
× 3 flavors would mean 18 kit variants, each with its own components and price. With a Cart
Transform the kit stays one variant at one price, and the choice travels with the cart line.

**How the cat kit works:**

1. A theme app block, **Starter kit picker** (`extensions/refill-radar/blocks/starter-kit-picker.liquid`),
   renders two selects on the kit's product page and joins them to the theme's add to cart form
   with the HTML `form` attribute. The choices reach the cart as line item properties
   `_kit_recipe` and `_kit_treat` (the leading underscore hides them from the buyer).
2. The Function (`cart.transform.run`, TypeScript) reads each line's two attributes and the
   configuration in an `$app` JSON metafield on the Cart Transform. For every kit line it returns
   a `lineExpand` operation with the chosen recipe and treat, one of each per kit.
3. The kit price is split across the two components in proportion to their list prices, in
   cents, with the rounding remainder on the last component, so the parts always add up to the
   kit price (`fixedPricePerUnit`). Example: $26.99 → $20.47 + $6.52.
4. A missing or unknown choice falls back to the default recipe and flavor (a kit added through
   the Ajax API still works). Lines that aren't the kit, or a missing configuration, return no
   operations.

**Admin page.** The **Bundles** section of `/app/checkout-rules` builds the configuration from
the store's own products: every active dry cat food with a 1.5 kg bag, and every priced variant of
the treats product. It lists anything that blocks the build (kit not active, kit variant without
`requiresComponents`, no recipes), creates the Cart Transform (`cartTransformCreate`), and writes
the same options to an app-owned shop metafield that the picker block reads, so the block never
offers a choice the Function can't expand. A badge shows **Needs update** when products or prices
changed since the last save. A contract test runs every configuration the page builds through
the Function's own parser.

**What the store showed** (checked with a test order, then cancelled and deleted):

- The order has no kit line: it has the two components, grouped by a `lineItemGroup` that holds
  the kit variant and its `_kit_*` attributes. The admin shows each as "Part of: Cat Starter Kit".
- Inventory and fulfillment follow the components: their stock goes down, they ship as one
  group, and the shipping weight is theirs. The kit variant is untracked and never moves.
- Expanded quantities are per kit: two kits in one line become two of each component.
- **Discount Functions see the kit line, not the components.** The Refill reward (dry food only)
  doesn't apply to the dry food inside the kit, while a loose bag in the same cart gets it. That's
  kept on purpose: the kit is already an entry price.

**Rules worth knowing:**

- **One Cart Transform per app and store.** Any future bundle logic goes into the same Function
  and configuration.
- **`requiresComponents: true` on the kit variant.** Shopify hides it from channels that don't
  support bundles and drops it from a cart where nothing expands it. The Cart Transform is
  created with `blockOnFailure: false`, so a failing Function removes the kit instead of blocking
  checkout.
- **No selling plans.** Shopify rejects transform operations on a line with a selling plan, so both
  kits are one-time purchases, and they stay out of B2B catalogs.
- **Joining a form from outside.** The picker reads the form's id with `getAttribute("id")`: the
  product form holds an `<input name="id">` (the variant), and named controls shadow form
  properties, so `form.id` is that input. It also skips hidden `/cart/add` forms without a submit
  button, such as the Shop Pay Installments terms form.
- **Liquid reads `$app` metafields** on the shop without a definition and with storefront access
  left off, so the options aren't exposed to the Storefront API.

**Instruction budget.** Measured with `shopify app function run`. A cart holds at most 18
different kit lines: two kits with the same recipe and flavor share one line (only its quantity
grows), and there are 6 × 3 combinations. The worst case is a full 200-line cart with all 18:

| Cart | 5 lines (2 kits) | 50 lines (10 kits) | 200 lines (18 kits) |
|---|---|---|---|
| Starter kit expand | 1.15 M | 3.89 M | 10.31 M (94 %) |

At 200 lines about 6.9 M goes to parsing the input, 0.95 M to the configuration and 2.6 M to the
kits. The code already avoids regular expressions and intermediate arrays (a regex check on
variant IDs and `map`/`filter` chains cost about 0.2 M more), and shorter option labels changed
nothing. The margin is thin: each extra recipe or flavor adds possible kit lines, and about 25
kit lines in a 200-line cart would pass the 11 M limit. Growing the options would mean moving
the Function to Rust, the language Shopify recommends when instruction counts matter.

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

1. Merge to `develop`, then promote that `develop` deployment to production in Vercel (Promote
   to Production rebuilds it with the production environment). Vercel's production branch is
   `main`, which receives `develop` at release time.
2. If the schema changed: `npx prisma migrate deploy` with the production URLs in the
   environment.
3. If the app configuration or extensions changed: `shopify app deploy`. Function instances
   (discounts, validations) created during a development preview are removed with it: create
   them again from the production app.
4. After a development session on the dev store: `shopify app dev clean` (or "Clean dev
   preview" in the admin's Dev Console). Until then the store keeps the development preview,
   which points the app at a tunnel that no longer exists.

**First release on a store.** A database starts empty: open the app (token exchange stores the
session), run "Rebuild from orders" on Refill Radar (it also sends any due reminders) and "Sync
B2B to HubSpot". Shop data itself lives in Shopify. Flow workflows built on the `Refill due`
trigger during a development preview keep listening to the preview trigger: select the trigger
again in the workflow after the first deploy.

**Testing the pixel.** Network-level tracker filters (for example a VPN's threat protection,
which inspects HTTPS even in a private window) can answer the pixel sandbox worker and
`/api/collect` with an empty `204`. The pixel then loads no code and sends nothing, without a
console error. Before debugging, compare the worker's response headers with a normal storefront
URL (a filtered reply has almost none) or allowlist the store. Reorders are counted by the
`orders/create` webhook either way.

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
