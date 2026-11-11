# 017 — Refill metafields recovery

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/017-refill-metafields-recovery` |
| Estimate  | 2–3 h (AI-assisted) · 5–7 h manual |
| Actual    | ~1 h |

## Goal

Every Refill Radar customer metafield the app declares exists in the store with current values, so the
storefront reminder, the "Reorder" button and the refill reward work again. If a declared definition
goes missing in the future, the merchant sees it on the Refill Radar page instead of features failing
in silence.

## Context

Refill Radar (specs 008, 009, 012, 014) writes four app-owned customer metafields, all declared in
`shopify.app.toml`:

- `$app.refill_run_out` (`date`): the refill reward Function and the storefront reminder read it.
- `$app.refill_forecast` (`json`): the customer account page reads it.
- `$app.refill_variants` (`list.variant_reference`): the storefront "Reorder" button reads it.
- `$app.refill_reminders` (`boolean`): the reminder choice made in checkout.

The active app version declares all four, but the store has only `refill_forecast` (6 customers with
values) and `refill_reminders`. No customer has a value for `refill_run_out` or `refill_variants`.
The backend writes all three forecast metafields in one `metafieldsSet`, which is all-or-nothing. So
the two definitions were most likely removed after the values were written, and their values went with
them. Declarative definitions are created and updated on `app deploy`, and a deploy applies changes
against the previous version, so an unchanged TOML does not bring them back.

Effect today: the refill reward never applies, the reminder block shows no date, "Reorder" has no
variant, and four criteria of spec 016 cannot be checked.

This belongs in the app: the definitions are app-owned (only the app can create or change them) and
the values come from the app's forecast data.

## Scope

**In scope**
- Restore the two definitions through the app configuration: deploy a version that changes their TOML
  entries, then confirm by Admin API that both exist with the declared type and access.
- A "Rewrite forecasts" action on the Refill Radar page. It recomputes every customer's forecast from
  the purchases already stored and writes the metafields. It sends no reminders: no Klaviyo event and
  no Flow trigger.
- A check on the Refill Radar page that lists any declared customer definition missing in the store,
  with the fix (redeploy, then rewrite forecasts).
- Close the four open criteria of spec 016 once the values exist: reminder and "Reorder", refill reward
  in Spanish checkout, a backend run against the store, and the cart and account walkthrough.

**Out of scope**
- Changing the forecast logic or the reminder channels.
- Order and checkout definitions (`$app.refill_reminders` on orders), which exist and work.

## Acceptance criteria

- [x] Given the deployed version, then `metafieldDefinitions(ownerType: CUSTOMER, namespace: "$app")`
      returns `refill_run_out` (`date`), `refill_forecast`, `refill_variants` (`list.variant_reference`)
      and `refill_reminders`, each with the access declared in the TOML
      _Verified after `vicubites-app-10`: all four exist with the declared type and access._
- [x] Given stored purchases, when the merchant runs "Rewrite forecasts", then every customer with a
      forecast has `refill_run_out` and `refill_forecast`, and `refill_variants` when a variant is known;
      no Klaviyo event or Flow trigger is sent
      _Verified in production: "6 customers updated from stored purchases. No reminders were sent."; by API,
      `refill_run_out` and `refill_variants` have 6 values each._
- [x] Given a declared definition missing in the store, then the Refill Radar page names it and says how
      to fix it; with all four present, no warning shows
      _With all four present the page shows no warning (production). The missing case is covered by the
      `missingDefinitions` unit tests; the banner renders that list as is._
- [x] Given a demo customer whose run-out date is close, when they open a dry food product, then the
      reminder shows the date in the buyer's language and "Reorder" adds the last bag
- [x] Given that customer in the Spanish checkout with a dry food bag, then the refill reward applies
- [x] Access scopes: none added
- [x] Every Admin GraphQL operation is typed by codegen and validated against the pinned API version
- [x] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass

## Technical approach

- `shopify.app.toml`: change the `description` of `refill_run_out` and `refill_variants` (more precise
  wording) so the next deploy carries a change for both entries; `shopify app deploy`; read the
  definitions back by API. If they are still missing, stop and research before any other change.
- `app/lib/refill/store.server.ts`: `rewriteForecasts(graphql, shop)` calls `refreshCustomer` for each
  customer with stored purchases. It is the load path without the bulk download and without
  `sendDueReminders`.
- `app/lib/refill/definitions.ts` (pure, tested): the declared keys and types, and
  `missingDefinitions(declared, found)`. `definitions.server.ts`: one query for the `$app` customer
  definitions. The test pins the declared list to `shopify.app.toml`.
- `app/routes/app.refill.tsx`: the loader adds the missing list; an intent `rewrite-forecasts`; a
  warning banner and the button (Polaris web components).
- Test data: the 6 demo customers already in the store (announced before the rewrite). Values are
  recomputed, not invented.

Access scopes added: none (`read_customers` and `write_customers` already cover customer metafields).

## References

- Manage metafield definitions (TOML and API): https://shopify.dev/docs/apps/build/metafields/definitions
- `metafieldsSet`: https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/metafieldsSet

## Risks and open questions

- The docs don't say how a deploy treats a declared definition that no longer exists in the store. If
  the description change does not recreate it, the fallback is to research that case first; the
  definitions are never created through the API under `$app` while the TOML declares them.
- The rewrite writes to customers on the production store: only the 6 demo customers have purchases.
