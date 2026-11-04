# 010 — Refill Due Flow trigger, B2B sync to HubSpot and CI

| Field     | Value |
|-----------|-------|
| Status    | In progress |
| Branch    | `feature/010-flow-hubspot-ci` |
| Estimate  | 4–6 h · ~4–5.5 h (AI-assisted) · ~11–15 h manual |
| Actual    | — |

## Goal

Three additions for the merchant's operations team:

- **Shopify Flow:** every customer whose food is due to run out reaches Flow as a `Refill due`
  trigger, so staff can build their own automations (tag the customer, notify the team, create a
  task) with no code.
- **HubSpot:** B2B companies and their contacts are kept in sync with HubSpot CRM (Free), so the
  sales team works from an up-to-date account list.
- **CI:** every push and pull request runs typecheck, lint, tests and the production build on
  GitHub Actions.

## Context

[Spec 009](009-refill-radar-reminders.md) sends due-soon forecasts to Klaviyo for B2C email.
Klaviyo is the customer-facing channel; Flow is the internal one. Both read the same due-soon
forecasts from [spec 008](008-refill-radar.md) and are deduplicated per customer, species and
run-out date, each channel on its own.

**Why an app:** a Flow trigger can only be defined by an app extension (`flow_trigger`) and
fired from a backend (`flowTriggerReceive`). The HubSpot sync needs a server that receives
Shopify webhooks and holds the HubSpot token; neither can live in the theme or in Flow alone.

**Shopify Flow today:** a `flow_trigger` extension declares a `handle` and typed
`[[settings.fields]]`. Reference fields (`customer_reference`) need no key and arrive in the
payload as `customer_id`; custom fields need a key (letters and spaces, sentence case) and one of
`single_line_text_field`, `number_decimal`, `boolean`, `email`, `url`. There is no date type.
The payload must stay under 50 KB. For custom apps, triggers are available on Plus stores and
Plus dev stores (Vicubites is one). `shopify app dev` exposes a draft version of the trigger;
`shopify app deploy` releases it (spec 011).

**HubSpot today:** legacy private apps can no longer be created (since 2026-10-26). A
single-account integration uses an app on the HubSpot developer platform with
`auth.type = "static"` and `distribution = "private"`, which issues a static access token sent as
`Authorization: Bearer`. Free and Starter accounts are limited to 100 requests per 10 seconds per
app and 250,000 per day.

**Data minimization (D-033):** HubSpot receives the company name, the Shopify company ID and each
contact's email address. No addresses, phone numbers, orders or prices.

## Scope

**In scope**

- `refill-due` Flow trigger extension with fields:
  - customer (`customer_reference`)
  - `Species` (`single_line_text_field`: `dog` or `cat`)
  - `Run out date` (`single_line_text_field`, `YYYY-MM-DD`)
  - `Days left` (`number_decimal`)
  - `Forecast basis` (`single_line_text_field`: `estimate` or `cadence`)
- Fire the trigger from the same places that send Klaviyo events today (the `orders/create`
  webhook and the "Send reminders" action on the Refill Radar page), independent of whether
  Klaviyo is connected. One trigger per customer, species and run-out date; results recorded per
  channel.
- A sample workflow in the dev store, built by the owner from the trigger (tag the customer
  `refill-due`).
- HubSpot sync, Shopify → HubSpot only:
  - Webhooks `companies/create`, `companies/update`, `company_contacts/create`,
    `company_contacts/update`.
  - A "Sync B2B to HubSpot" action for the initial load of every existing company.
  - Companies upserted by a unique custom property `shopify_company_id`; contacts upserted by
    email and associated with their company.
  - Retries with backoff on `429` and `5xx`; the token read from `HUBSPOT_ACCESS_TOKEN`; the sync
    does nothing when the token is missing.
  - Sync status on a new "B2B CRM" admin page: connected or not, last sync, companies and
    contacts synced, failures with their message.
- Unit tests for the Flow payload builder, the HubSpot mappers, the HubSpot client (mocked
  `fetch`: success, `429` retry, error) and the per-channel deduplication.
- GitHub Actions workflow on pushes and pull requests to `develop` and `main`: `npm ci`,
  `prisma generate`, typecheck, lint, tests, `react-router build`.

**Out of scope**

- Production deploy, hosting and the Postgres migration (spec 011, D-044).
- Flow actions and Flow lifecycle callbacks (knowing which shops have an enabled workflow).
- Deletions in HubSpot when a company or contact is deleted in Shopify, and any HubSpot →
  Shopify sync.
- B2C customers in HubSpot (B2C reaches Klaviyo, spec 009).
- Scheduled runs: reminders still run on order webhooks and on demand.

## Acceptance criteria

- [x] With `app dev` running, the `Refill due` trigger appears (draft) in the Flow editor of the
      dev store with its five fields.
- [x] Given a due-soon forecast, when reminders run, then the workflow built on the trigger runs
      once for that customer, species and run-out date, and running reminders again does not
      fire it a second time. Verified: two due-soon demo customers, two workflow runs (customer
      tagged `refill-due`); the second run reported "Flow: sent 0 · already sent 2".
- [x] Flow fires even when `KLAVIYO_PRIVATE_KEY` is not set, and a failed Flow call does not stop
      the Klaviyo event (and vice versa). Verified by unit tests of `sendDueReminders` with Prisma,
      Flow and Klaviyo mocked.
- [x] Given the demo B2B company, when "Sync B2B to HubSpot" runs, then HubSpot shows the company
      (name and `shopify_company_id`) and its contacts (email) associated with it.
- [x] Running the sync twice creates no duplicates in HubSpot.
- [x] Renaming the demo company in Shopify updates its name in HubSpot through the
      `companies/update` webhook.
- [x] Without `HUBSPOT_ACCESS_TOKEN`, the B2B CRM page shows "Not connected" and the webhooks
      return 200 without calling HubSpot. Verified by a unit test (no request is sent) and by
      reading the page and webhook code; not exercised in the store, where the token is set.
- [x] Only the fields listed under data minimization reach HubSpot (checked in the request
      bodies of the tests and in the HubSpot record: phone, city and domain are empty).
- [x] Access scopes: none added (`write_customers` already grants the `read_customers` that
      companies, company contacts, their webhooks and the trigger's customer reference need).
- [x] Every Admin GraphQL operation is typed by codegen and validated against 2026-10.
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass locally,
      and the CI workflow passes on the pull request. (Local checks pass; CI pending on the PR.)
- [ ] One announced axe pass on the new B2B CRM page.

## Technical approach

- **Flow trigger:** `extensions/refill-due-trigger/shopify.extension.toml`
  (`type = "flow_trigger"`, `handle = "refill-due"`). `app/lib/flow/` holds a pure
  `refillDuePayload()` builder (tested) and `fireFlowTrigger()`, which calls `flowTriggerReceive`
  through `adminGraphql()` and `assertNoUserErrors()`. The customer reference is sent as the
  numeric customer ID.
- **Reminder channels:** `sendDueReminders()` becomes a dispatcher over two channels, `KLAVIYO`
  and `FLOW`. `RefillReminder` gains a `channel` column (default `KLAVIYO`, so existing rows
  keep their meaning) and its unique key becomes shop + customer + species + run-out date +
  channel. Each channel is deduplicated and recorded on its own; the Refill Radar page shows
  both.
- **HubSpot:** `app/lib/hubspot/client.server.ts` (fetch with retries, token from the
  environment), `app/lib/hubspot/mappers.ts` (pure, tested), `app/lib/hubspot/sync.server.ts`
  (reads companies and contacts through GraphQL, upserts in batches, records results).
  Endpoints: `POST /crm/v3/objects/companies/batch/upsert` with `idProperty: shopify_company_id`,
  `POST /crm/v3/objects/contacts/batch/upsert` with `idProperty: email`, and the associations
  API for contact → company. A `CrmSyncRecord` Prisma model keeps one row per Shopify object
  (HubSpot ID, status, error, synced at).
- **HubSpot app (owner):** a developer platform app with static auth and private distribution,
  scopes `crm.objects.companies.read`/`write`, `crm.objects.contacts.read`/`write` and
  `crm.schemas.companies.write` (to create `shopify_company_id` from code, once). Exact scope
  names are confirmed in the HubSpot app settings.
- **Webhooks:** the four company topics added to `shopify.app.toml` (requires restarting
  `app dev`); handlers stay thin and call `app/lib/hubspot/sync.server.ts`. Webhooks notify, the
  handler re-reads the company through GraphQL.
- **CI:** `.github/workflows/ci.yml` on Node 22 (`engines`: `>=22.12`), npm cache, no secrets
  needed (generated types are committed; tests mock external APIs).

Access scopes added: none.

## References

- [Create Shopify Flow triggers](https://shopify.dev/docs/apps/build/flow/triggers/create)
- [Flow trigger reference](https://shopify.dev/docs/apps/build/flow/triggers/reference)
- [flowTriggerReceive](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/flowTriggerReceive)
- [Company](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Company) and
  [CompanyContact](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/CompanyContact)
- [WebhookSubscriptionTopic](https://shopify.dev/docs/api/admin-graphql/2026-10/enums/WebhookSubscriptionTopic)
- [HubSpot authentication overview](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/overview)
- [HubSpot legacy private apps](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/overview)
- [HubSpot Companies API](https://developers.hubspot.com/docs/api-reference/crm-companies-v3/guide)
  and [Contacts API](https://developers.hubspot.com/docs/api-reference/crm-contacts-v3/guide)

## Risks and open questions

- `flowTriggerReceive` behaviour when the shop has no enabled workflow for the trigger: confirmed
  during implementation (expected: accepted with no run).
- Contact upsert by email does not support partial upserts: every contact upsert sends the full
  (minimal) property set.
- The contact → company association type ID is confirmed in the associations API before use.
- The demo store has one B2B company; contacts may need to be added as tagged demo data
  (announced to the owner first).
