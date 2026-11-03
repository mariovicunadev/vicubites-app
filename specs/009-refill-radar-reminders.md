# 009 — Refill Radar: storefront reminder, web pixel and Klaviyo events

| Field     | Value |
|-----------|-------|
| Status    | Approved |
| Branch    | `feature/009-refill-radar-reminders` |
| Estimate  | 6–8 h · ~3–4 h (AI-assisted) · ~14–18 h manual |
| Actual    | — |

## Goal

Logged-in B2C customers see on the storefront when their dry food is expected to run out, with a
link to buy more. Merchants see whether those reminders lead to reorders, and every customer who
is due soon reaches Klaviyo as a `Refill Due` event that a Klaviyo flow can turn into an email.

## Context

[Spec 008](008-refill-radar.md) stores one forecast per customer and species, in the app database
and as the app-owned customer metafields `$app.refill_run_out` and `$app.refill_forecast`. This
spec puts that data to work in three places:

- **Storefront:** a theme app extension block, so the merchant places it from the theme editor
  and it survives a theme change. Liquid can read any metafield whatever its storefront access
  setting, so both metafields keep `storefront` and `customer_account` access at `none`: the
  Storefront API and the Customer Account API never need them.
- **Measurement:** an app web pixel. It loads only when the visitor has granted analytics
  permission (declared in `shopify.extension.toml`), and it sends no customer identity: the
  customer fields of the pixel `init` data need protected data the pixel doesn't use. Events are
  keyed by the browser's `clientId`; the order ID from `checkout_completed` links a reminder to a
  reorder the app already knows from the `orders/create` webhook.
- **Messaging:** Klaviyo, through its Events API. Klaviyo identifies a profile by email, so this
  spec is the first to read a level 2 protected customer field (email), only to send the event.
  The email is never stored by the app.

## Scope

**In scope**
- Theme app extension `refill-radar` with one app block, `Refill reminder`:
  - Renders only for a logged-in customer with a forecast; renders nothing otherwise.
  - One line per species, earliest first: "Your dog's food is expected to run out around
    November 20" (or "may have run out on …" when past), the basis ("estimate from the bag size"
    or "based on how often you reorder") and a link to the collection the merchant picks per
    species in the block settings.
  - In the theme editor (`request.design_mode`) it shows sample data, so the merchant can place
    and style it without a customer session.
  - Publishes the custom events `vicubites_refill:reminder_viewed` and
    `vicubites_refill:reminder_clicked` (species and days-left bucket only) with
    `Shopify.analytics.publish`.
  - Text in locale files; framed as an estimate, never as feeding advice.
- Web pixel extension `refill-radar-pixel`, `runtime_context = "strict"`, with
  `[customer_privacy]` analytics `true`, marketing `false`, preferences `false`, sale of data
  `"disabled"`. Subscribes to the two custom events and to `checkout_completed`, and posts a
  minimal payload (event name, `clientId`, timestamp, species, bucket, order ID) to the app.
- App proxy `/apps/vicubites-refill/events`: receives the pixel's posts, signed by Shopify, so
  the pixel carries no app URL and the endpoint knows which shop sent them. Validates event name,
  shape and size; stores them in `RefillEvent`; deletes events older than 90 days.
- "Connect pixel" action on `/app/refill` (`webPixelCreate`, then `webPixelUpdate` when it
  exists) and the pixel's status.
- Reminder card on `/app/refill` (last 30 days): reminders viewed, clicked, and reorders of dry
  food by a browser that viewed a reminder before the order.
- Klaviyo:
  - `Refill Due` event (`POST /api/events`, pinned revision) for every forecast that is due soon
    (run-out within 14 days or past), with properties species, run-out date, days left, basis
    and days of food; `unique_id` = customer, species and run-out date, so Klaviyo records each
    reminder once.
  - Sent after the webhook recompute and the bulk load, and by a "Send due reminders" action on
    `/app/refill` (there is no scheduler yet). Each send is recorded in `RefillReminder` with its
    result; the page shows the last send.
  - The private key lives in the server environment (`KLAVIYO_PRIVATE_KEY`, scope
    `events:write`); without it, the Klaviyo section says "not connected" and nothing is sent.
  - Customer email read by ID at send time (`defaultEmailAddress`), never stored or logged.
- Demo: one demo customer's email changed to an address that can receive the sign-in code, for
  the end-to-end check (storefront login, block, pixel, test order, Klaviyo flow email).

**Out of scope**
- One-click reorder of the exact bag (would need the variant in the forecast); the link goes to
  the species collection.
- A daily scheduler for Klaviyo sends; Shopify Flow trigger; customer account UI extension.
- Email marketing consent sync: consent lives in Klaviyo (a production store would also install
  Klaviyo's Shopify integration, whose profiles the events merge into by email).
- Klaviyo templates and flows as code: the flow is built in Klaviyo and documented in the README.

## Acceptance criteria

- [ ] Liquid in the block reads `customer.metafields["$app"].refill_run_out` and
      `refill_forecast` with storefront access left at `none` (checked first, before the rest of
      the block)
- [ ] Given a logged-in demo customer with a dog forecast due in 5 days, then the block shows the
      run-out date, the basis and the dog collection link; given a logged-out visitor or a
      customer without a forecast, then it renders no markup
- [ ] Given a dog-and-cat home, then the block lists both species, earliest first
- [ ] In the theme editor the block shows sample data and its settings (heading, one collection
      per species)
- [ ] Given analytics permission, when the block is viewed and its link clicked, then two events
      reach the app through the app proxy and are stored; a forged post without a valid proxy
      signature is rejected
- [ ] Given a test order by the demo customer after viewing the reminder, then the reminder card
      counts one view, one click and one reorder
- [ ] The pixel declares only analytics permission and reads no customer fields
- [ ] Given `KLAVIYO_PRIVATE_KEY`, when "Send due reminders" runs, then every due-soon forecast
      becomes one `Refill Due` event in Klaviyo; running it again creates no duplicates
- [ ] Given the Klaviyo flow on `Refill Due`, then the signed-in demo address receives the email
- [ ] Without the key, the page shows Klaviyo as not connected and the webhook still succeeds
- [ ] The app stores no customer email; events older than 90 days are deleted
- [ ] Metafield access unchanged (`merchant_read`, no storefront or customer account access)
- [ ] Access scopes: only the ones this feature needs, listed below; protected data: email only
- [ ] Every Admin GraphQL operation is typed by codegen and validated against the pinned API version
- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npx react-router build` pass
- [ ] One axe pass on a storefront page with the block (text checks for the rest)

## Technical approach

- `extensions/refill-radar/`: `blocks/refill-reminder.liquid` (schema with `enabled_on` for
  index, product, collection, cart and page templates; `collection` settings per species),
  `assets/refill-reminder.css`, a small deferred `assets/refill-reminder.js` for the two events,
  `locales/en.default.json`. Parsing the forecast JSON in Liquid, no API call.
- `extensions/refill-radar-pixel/`: `src/index.ts` with `register()` and
  `analytics.subscribe`, posting with `fetch` (`keepalive`) to the shop's proxy path.
- `app/lib/refill/events.ts`: payload validation, days-left buckets and funnel counts (pure,
  tested). `app/lib/refill/events.server.ts`: Prisma writes and retention.
- `app/lib/klaviyo/`: `event.ts` builds the request body and `unique_id` (pure, tested);
  `client.server.ts` sends it (revision header, `Klaviyo-API-Key` auth, retry on 429).
  `app/lib/refill/reminders.server.ts`: picks due-soon forecasts, reads each email by ID, sends,
  records `RefillReminder`.
- Routes: `apps.refill.events.tsx` (`authenticate.public.appProxy`); `app.refill.tsx` gains the
  pixel and Klaviyo actions and the reminder card.
- Prisma: `RefillEvent` (shop, client ID, name, species, bucket, order ID, created at) and
  `RefillReminder` (shop, customer ID, species and run-out date unique together, sent at,
  status).
- `shopify.app.toml`: `[app_proxy]`, scopes below. Email access: level 2 is always available to
  custom-distribution apps; checked with a read of one demo customer's email before building on
  it.

Access scopes added: `write_pixels`, `read_customer_events`. Protected customer data: email
(level 2).

## References

- Theme app extension configuration and reserved `$app` prefixes:
  https://shopify.dev/docs/apps/build/online-store/theme-app-extensions/configuration
- App-owned metafields read in Liquid regardless of storefront access:
  https://shopify.dev/docs/apps/build/security/storefront/store-settings-in-app-owned-metafields ·
  https://shopify.dev/docs/apps/build/metafields
- Web pixels, privacy settings and custom events: https://shopify.dev/docs/apps/build/marketing/build-web-pixels ·
  https://shopify.dev/docs/api/web-pixels-api/pixel-privacy ·
  https://shopify.dev/docs/api/web-pixels-api/emitting-data
- Pixel `init` data and protected fields: https://shopify.dev/docs/api/web-pixels-api/standard-api/init
- Protected customer data levels: https://shopify.dev/docs/apps/launch/protected-customer-data
- App proxies: https://shopify.dev/docs/apps/build/online-store/app-proxies
- Klaviyo Create Event: https://developers.klaviyo.com/en/reference/create_event

## Risks and open questions

- Liquid docs show the `$app` prefix with a sub-namespace (`"$app:settings"`); a bare `$app`
  read is not documented. The first criterion checks it; if it fails, the definitions move to a
  sub-namespace and spec 008's metafield write follows.
- The pixel sandbox posting to the app proxy (cross-origin `fetch` from a worker) is not covered
  by the docs; if blocked, the pixel posts straight to the app with the shop domain from `init`
  and the endpoint checks it against installed shops.
- Custom events can be published from the browser console: the endpoint treats them as
  untrusted counts, never as orders or identities.
- Pixel settings must match the extension's settings schema; whether an empty schema is valid
  for `webPixelCreate` is checked first.
- Klaviyo free plan limits (profiles and monthly sends) and sender verification may delay the
  flow email; Klaviyo's "send test" is the fallback evidence.
- Sends happen only on events and on demand; a forecast that becomes due with no new order
  waits for the next manual send until a scheduler exists.
