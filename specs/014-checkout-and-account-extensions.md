# 014 — Refill Radar in checkout and customer accounts

| Field     | Value |
|-----------|-------|
| Status    | Approved |
| Branch    | `feature/014-checkout-account-extensions` |
| Estimate  | 4–5.5 h (AI-assisted) · 10–13 h manual |
| Actual    | — |

## Goal

Bring Refill Radar (specs 008–009) to the two buyer surfaces that apps extend with UI extensions:

- **Checkout:** a "Refill Radar" block tells the buyer that the order updates their refill forecast
  and lets them turn refill reminders off (or back on). The choice travels with the order.
- **Customer accounts:** a "Refill Radar" page shows each pet's forecast (days of food, run-out
  date, due soon or not), whether reminders are on, and a reorder button for the last bag bought.

## Context

Checkout and the new customer accounts are not themed with Liquid. Apps extend them with UI
extensions: Preact code that renders Polaris web components (`s-*`) inside a sandboxed worker,
placed by targets. A merchant positions dynamic targets in the checkout and accounts editor.

Refill Radar already computes a forecast per customer and species from their orders and stores it
in app-owned customer metafields (`$app:refill_forecast`, `$app:refill_run_out`,
`$app:refill_variants`). Reminders go out through Klaviyo and Flow to every customer with a forecast
that is due soon. There is no way for a buyer to opt out from a store surface today.

Writing from checkout uses **cart metafields**. In API version 2026-10, `applyAttributeChange` (cart
attributes) is deprecated and the `metafields` property was replaced by `appMetafields` (2026-04).
A cart metafield whose order metafield definition has the cart-to-order copyable capability is copied
to the order when it is placed, where the `orders/create` webhook reads it.

## Scope

**In scope**
- Checkout UI extension `refill-checkout`, target `purchase.checkout.block.render`:
  - Renders only when the cart has a dry food line (product metafield `custom.kcal_per_kg` set).
  - Text: the order updates the buyer's refill forecast. Checkbox "Remind me before this food runs
    out", checked by default (current behavior), backed by cart metafield `$app:refill_reminders`
    (`boolean`), written with `applyMetafieldChange({ type: "updateCartMetafield" })`.
  - When `instructions.metafields.canSetCartMetafields` is false (accelerated checkouts, draft
    orders), the checkbox is hidden and only the text shows.
  - Locales: `en.default.json` and `es.json`.
- Order metafield definition `$app:refill_reminders` (`boolean`) with the cart-to-order copyable
  capability, declared in `shopify.app.toml` (Admin API `metafieldDefinitionCreate` as a fallback if
  the declarative capability isn't supported).
- Backend:
  - `fetchOrder` reads `$app:refill_reminders` from the order.
  - New Prisma model `RefillPreference` (`shop`, `customerId`, `reminders`, `orderId`, `updatedAt`,
    unique on `shop` + `customerId`). The latest order with a value wins; no row means reminders on.
  - `sendDueReminders` skips customers whose preference is off, on both channels.
  - Customer metafield `$app:refill_reminders` (`boolean`) mirrors the preference for the account page.
  - `/app/refill` shows how many customers turned reminders off.
- Forecast JSON gains `variantId` per species (last dry food variant), so the account page can link
  the right bag without resolving variants.
- Customer account UI extension `refill-account`, target `customer-account.page.render`:
  - Reads `$app:refill_forecast` and `$app:refill_reminders` with the Customer Account API
    (`shopify://customer-account/api/2026-10/graphql.json`).
  - One card per species: days of food, last order date, run-out date, "Due soon" badge within
    `DUE_SOON_DAYS`; reorder button to the storefront cart permalink (`/cart/<variant>:1`).
  - Reminders status line ("on" / "off, change it at your next checkout").
  - Empty state when there is no forecast yet.
  - Locales: `en.default.json` and `es.json`.
- Customer metafield definitions get customer account read access (`access.customer_account`).
- README section "Refill Radar in checkout and customer accounts".

**Out of scope**
- Changing the reminder preference from the account page (writes from customer accounts need
  protected customer data approval for writes; a later iteration).
- Order status, thank-you or profile blocks; order action menus.
- Showing the Refill reward discount in the extension (checkout already shows the discount line).
- Marketing consent: Klaviyo consent and Shopify email marketing status stay as they are.

## Acceptance criteria

- [ ] Given a cart with dry food, when the buyer reaches checkout, then the Refill Radar block shows
      the forecast text and the reminders checkbox, checked by default
- [ ] Given a cart without dry food, the block renders nothing
- [ ] Given the buyer unchecks the box and places the order, then the order has
      `$app:refill_reminders = false`, `RefillPreference.reminders` is false and the customer metafield
      mirrors it
- [ ] Given a customer with reminders off and a due-soon forecast, when reminders run, then no Klaviyo
      event or Flow trigger is sent for them (skipped, not failed)
- [ ] Given a later order with the box checked, reminders are back on
- [ ] Given an accelerated checkout (`canSetCartMetafields` false), the checkbox is hidden and the
      order keeps the previous preference
- [ ] Given a signed-in customer with a forecast, the Refill Radar page lists one card per species
      with run-out date, due soon badge, reminders status and a working reorder link
- [ ] Given a customer without a forecast, the page shows the empty state
- [ ] Both extensions render in English and Spanish
- [ ] Bundles stay under the limits (64 KB checkout, 128 KB full page), checked in the build output
- [ ] Access scopes: no new scopes
- [ ] Every Admin GraphQL operation is typed by codegen and validated against 2026-10; the Customer
      Account API query is validated against `customer` 2026-10
- [ ] Unit tests: preference from order, reminder skipping, forecast `variantId`, extension helpers
      (dry food detection, card view model)
- [ ] One announced axe pass on the checkout block and the account page
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass
- [ ] Deployed: app version released, `develop` promoted in Vercel, block placed in checkout and page
      added to the customer account menu in the published editor

## Technical approach

- `extensions/refill-checkout/` (Preact, `@shopify/ui-extensions` 2026-10): `src/Checkout.tsx`,
  pure helpers in `src/refill.ts` with Vitest tests. `shopify.extension.toml` declares the cart
  metafield (`[[extensions.targeting.metafields]]`) and the product metafield it reads.
- `extensions/refill-account/` (Preact): `src/RefillPage.tsx`, `src/forecast-view.ts` (view model,
  tested). `network_access` is not needed: the Customer Account API is called through the
  `shopify://` protocol, authenticated by Shopify.
- `shopify.app.toml`: `[order.metafields.app.refill_reminders]` with the copyable capability;
  `access.customer_account = "read"` on `refill_forecast` and new `refill_reminders`.
- `app/lib/refill/`: `preference.server.ts` (read from order, upsert, mirror metafield),
  `reminders.server.ts` filter, `forecast.ts` `variantId`. Migration `refill_preference` on the
  Neon `dev` branch first, production at deploy.
- `/app/refill`: reminders-off count.
- Access scopes added: none.

## References

- https://shopify.dev/docs/api/checkout-ui-extensions/2026-10
- https://shopify.dev/docs/api/checkout-ui-extensions/2026-10/target-apis/checkout-apis/attributes-api
- https://shopify.dev/docs/apps/build/checkout/migrate-to-web-components
- https://shopify.dev/docs/apps/build/checkout/fields-banners/add-field?extension=polaris
- https://shopify.dev/docs/apps/build/checkout/extension-performance
- https://shopify.dev/docs/api/customer-account-ui-extensions/2026-10/targets
- https://shopify.dev/docs/apps/build/customer-accounts/full-page-extensions
- https://shopify.dev/docs/apps/build/customer-accounts/metafields-in-customer-accounts
- https://shopify.dev/docs/api/customer/2026-10/queries/customer

## Risks and open questions

- Declarative syntax for the cart-to-order copyable capability and `access.customer_account` in
  `shopify.app.toml` is not shown in the docs consulted: confirm with `shopify app deploy` on the dev
  preview; fall back to Admin API definitions.
- Protected customer data: reading customer metafields from customer accounts may need level 1
  access in the Partner Dashboard (owner step).
- A full page only loads after the merchant adds it in the checkout and accounts editor; the menu
  link is a separate owner step.
- Accelerated checkouts can't write cart metafields: the preference only changes from the standard
  checkout.
- A cart permalink (`/cart/<variant>:1`) opens checkout with only that bag, not the buyer's current
  cart: acceptable for a one-click reorder, stated in the button's context text.
- The app's Liquid blocks keep `customer_account` access at `none` (Liquid reads `$app` anyway); only
  the two definitions the account page reads get `read`.
