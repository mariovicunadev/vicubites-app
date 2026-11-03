# 008 — Refill Radar: run-out forecast per customer

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/008-refill-radar` |
| Estimate  | 8–10 h · ~4.5–5.5 h (AI-assisted) · ~9–11 h manual |
| Actual    | ~1.3 h |

## Goal

Merchants see, for every B2C customer who buys dry food without a subscription, the date their
current bag is expected to run out, and a list of customers who are due soon. The forecast is
stored on the customer, so the storefront, customer accounts and automations can use it later.

## Context

Shopify covers subscribers through selling plans, but one-time buyers are invisible: Flow or
Shopify Email can only wait a fixed number of days after an order, whatever the bag size or how
often that customer actually reorders. The forecast needs the order history of the whole store,
a backend that reacts to new orders and data the app owns, which is why it lives in the app
(the criteria in the README). It reuses the bulk engine from [spec 002](002-bulk-export.md).

The storefront block, the web pixel and the marketing event come in spec 009; the Flow trigger
after that. This spec builds the data they read.

## Forecast model

- **Tracked products:** dry food only (option `Size`, values such as `2 kg` or `1.5 kg`), with
  `custom.species` and `custom.kcal_per_kg` set. Wet food packs and treats are not tracked.
- **One forecast per customer and species** (a home with a dog and a cat has two).
- **First order (estimate):** days of food = (bag grams × quantity × kcal per kg ÷ 1000) ÷
  reference daily kcal for the species. The reference values (dog 900 kcal/day, cat 250 kcal/day)
  are constants in one module, shown in the UI as an estimate, never as feeding advice.
- **Two or more orders (cadence):** days of food = median of the intervals between the customer's
  orders for that species. Real behaviour wins over the estimate.
- **Run-out date** = date of the last order + days of food. "Due soon" = run-out within 14 days
  or already past.
- B2B orders (purchasing entity is a company) are skipped: they restock a business, not a pet.

## Scope

**In scope**
- Protected customer data check: confirm with the new scopes that the app can read the order's
  customer ID on this store, before building on it. Only level 1 data: no name, email, phone or
  address is requested.
- Demo seed (`scripts/demo/seed-refill-orders.mjs`): 6 demo customers and 13 paid orders with past `processedAt` dates, all tagged
  `demo-refill-radar`, no emails sent, inventory bypassed. Mixes single-order customers, regular
  reorderers, one due soon, one overdue and one dog-and-cat home. Safe to re-run.
- Initial load: one bulk operation over orders (line items with variant, quantity, product
  species and kcal), parsed with the existing JSONL reader, run from the Refill Radar page.
- `orders/create` webhook: reads the order through GraphQL by ID (the same parser as the bulk
  path), stores it and recomputes that customer's forecast. Idempotent by order ID.
- Forecast stored in the app database and on the customer as app-owned metafields:
  `$app.refill_run_out` (date, the earliest across species) and `$app.refill_forecast` (JSON:
  species, run-out date, basis, last order date, days of food).
- Admin page `/app/refill`: due-soon list first, then all forecasts; each row links to the
  customer in the admin by ID, with species, run-out date, days left and basis (estimate or
  cadence); a "Rebuild from orders" action and the last load's status.

**Out of scope**
- Storefront app block, web pixel and marketing events (spec 009); Flow trigger.
- Orders older than 60 days (`read_all_orders`): the demo data is recent; noted in the README as
  what a real store would add.
- Cancellations, refunds and edits after the order is created.
- Wet food, treats, subscription orders' own schedule, B2B reorder forecasts.
- Per-pet profiles (weight, activity): the reference values stand in for them.

## Acceptance criteria

- [x] With the new scopes, a query for an order's customer ID succeeds on the store (the
      protected customer data check); the result is noted in this spec.
      *Result: denied (`ACCESS_DENIED`, "not approved to access the Customer object") until the
      app's distribution method was set to custom distribution for `vicubites.myshopify.com`;
      with it, level 1 access is available without a review and the query succeeds.*
- [x] The seed creates the demo customers and orders tagged `demo-refill-radar`, sends no
      email, and running it twice creates no duplicates. *6 customers and 13 orders tagged; the
      second run skipped the 5 orders the throttled first run had created.*
- [x] Given a customer with one order of a 7 kg dog bag, then the forecast's basis is
      "estimate" and the days of food follow the formula above.
- [x] Given a customer with three orders of the same species, then the basis is "cadence" and
      the days of food are the median interval.
- [x] Given a dog-and-cat home, then there are two forecasts and `refill_run_out` holds the
      earliest date.
- [x] Orders with only wet food or treats, B2B orders and orders without a customer create no
      forecast.
- [x] "Rebuild from orders" runs one bulk operation and, when it finishes, every demo customer
      has a forecast in the app and the two metafields on the customer. *28 objects (13 orders,
      15 line items) → 12 purchases, 6 forecasts for 5 customers; the wet-food buyer has none.
      Dog-and-cat home: `refill_run_out` = the dog's date.*
- [x] Given a new order for a demo customer, when `orders/create` arrives, then that customer's
      forecast and metafields update; a repeated delivery of the same webhook changes nothing.
      *Seed `--webhook-test`: the customer went from estimate (29 days) to cadence (20 days).
      Recording the same order twice more left the purchases identical.*
- [x] The Refill Radar page lists due-soon customers first, links each to the admin and never
      shows names or emails.
- [x] Access scopes: `read_orders` and `write_customers` only (the validator lists
      `read_customers` for the order's customer, included in `write_customers`), declared in
      `shopify.app.toml`; no level 2 fields in any query.
- [x] Every Admin GraphQL operation is typed by codegen and validated against the pinned API version
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass (103 tests)

## Technical approach

- `app/lib/refill/forecast.ts`: pure functions (bag grams from the option value, days of food,
  median interval, run-out date, due-soon), unit tested with Vitest.
- `app/lib/refill/orders.ts`: one order shape (`OrderData`) built from both the bulk JSONL rows
  and the single-order query, so the webhook and the bulk load share one parser; it turns an
  order into purchases (dry food per species, in kcal).
- `app/lib/refill/store.server.ts`: Prisma upserts and the metafield write (`metafieldsSet` on
  the customer, both keys in one call).
- `app/lib/refill/view.ts`: table rows (days left, due label, tone), unit tested.
- Prisma models: `RefillPurchase` (shop, order ID and species unique together, customer ID,
  processed at, kcal) and `RefillForecast` (shop, customer ID and species unique together,
  run-out date, basis, days of food).
- Bulk: a new `refill` job kind in the existing engine. Like the audit, the page consumes the
  completed operation on load (claimed once with a conditional update).
- Webhook route `webhooks.orders.create.tsx`, subscribed in `shopify.app.toml`.
- Metafield definitions declared in `shopify.app.toml` (`[customer.metafields.app.refill_run_out]`,
  `[customer.metafields.app.refill_forecast]`); storefront access is decided in spec 009.
- Route `app.refill.tsx` with Polaris web components, like the Data health page.

Access scopes added: `read_orders`, `write_customers`.

## References

- Access scopes, orders and the 60-day window: https://shopify.dev/docs/api/usage/access-scopes
- Protected customer data: https://shopify.dev/docs/apps/launch/protected-customer-data
- `Order` and `orderCreate` (2026-10): https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Order ·
  https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/orderCreate
- App-owned metafield definitions in TOML: https://shopify.dev/docs/apps/build/metafields/definitions
- Webhook topics: https://shopify.dev/docs/api/admin-graphql/2026-10/enums/WebhookSubscriptionTopic

## Risks and open questions

- Protected customer data on a custom-distribution app: if the customer ID comes back redacted
  or denied, the spec is blocked until access is granted; the first criterion checks it before
  any other work.
- `orderCreate` only accepts offline tokens, and Shopify CLI's `store auth` stores an online one,
  so the seed runs through the app's own token (`shopify app execute`). The app doesn't request
  `write_orders`: it is added to `shopify.app.toml` locally while seeding, never committed, and
  removed afterwards (checked with `currentAppInstallation`). Development stores throttle order
  creation ("Too many attempts"): the seed waits and retries.
- Webhook delivery in development depends on the tunnel; a test order is created through the
  seed script, not the checkout.
