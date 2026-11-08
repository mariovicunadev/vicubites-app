# 011 — Production deployment on Vercel and Neon Postgres

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/011-production-deploy` |
| Estimate  | 2 h · ~3–4 h (AI-assisted) · ~7–9 h manual |
| Actual    | ~3.5 h |

## Goal

Run the app's backend in production: the embedded admin, webhooks, the pixel endpoint and the
Klaviyo, Flow and HubSpot integrations are served from a stable public URL instead of a
development tunnel, backed by a managed Postgres database.

## Context

Until now the app has run only through `shopify app dev` (a tunnel to a local server) with
SQLite. Production needs:

- **A host.** The app is a React Router app with no long-running background work: every task
  starts from a request (admin page, webhook, pixel event). That fits serverless functions, so
  the app is deployed to **Vercel** (Hobby plan) with the official `@vercel/react-router`
  preset, which turns routes into Vercel Functions and lets Vercel split the server bundle.
- **A database that outlives a function.** Serverless functions have an ephemeral, per-instance
  filesystem, so a SQLite file cannot hold sessions or app data. Prisma moves to **Postgres on
  Neon** (Free plan).
- **A stable app URL.** `application_url`, the auth redirect, the webhook subscriptions (relative
  URIs), the pixel endpoint and the Flow trigger all resolve against the app URL.

Only the backend and its database are hosted. The theme, the theme app extension and the web
pixel run on Shopify; the storefront block does not call the backend.

## Scope

**In scope**
- Vercel preset (`react-router.config.ts`) and a build script that generates the Prisma client
  before the React Router build.
- An app URL resolver: `SHOPIFY_APP_URL`, falling back to Vercel's production URL.
- Prisma datasource switched to `postgresql`, with a pooled connection for the app and a direct
  connection for migrations.
- The SQLite migration history replaced by a single Postgres baseline migration (Prisma migration
  history is tied to one database provider).
- Local development on Postgres as well, on a separate Neon branch (`dev`), so development and
  production run on the same engine and production data stays untouched.
- Vercel project in the `iad1` region and Neon project in AWS `us-east-1`, close to each other.
- `shopify.app.toml` pointed at the production URL and released with `shopify app deploy`
  (configuration, extensions and the Flow trigger).
- Production verification of every backend surface (see the acceptance criteria).
- README: production architecture, environment variables and the deploy procedure; the
  `Dockerfile` kept as a portable alternative for container hosts.

**Out of scope**
- Custom domain, uptime monitoring and alerting.
- Preview deployments per pull request with their own database branch.
- A separate production app: one app serves both, and `shopify app dev` points it at the tunnel
  only while a development session runs.
- Moving to Prisma 7 or the Neon serverless driver adapter.

## Acceptance criteria

- [x] `npm run build` runs `prisma generate` before `react-router build` and succeeds locally and
      on Vercel
- [x] `prisma/schema.prisma` uses `postgresql` with `url = env("DATABASE_URL")` (pooled) and
      `directUrl = env("DATABASE_URL_UNPOOLED")`; `migration_lock.toml` says `postgresql`
- [x] One baseline migration creates the whole current schema; `prisma migrate deploy` applies it
      to the `dev` branch and to production with no drift (`prisma migrate status` is clean)
- [x] Local development runs against the Neon `dev` branch; no SQLite file is used
- [x] The production deployment answers on its `*.vercel.app` URL; Vercel functions run in `iad1`
      (`x-vercel-id: cle1::iad1::…`)
- [x] `shopify.app.toml` has the production `application_url` and auth redirect, and
      `shopify app deploy` releases a new app version
- [x] Given the app is opened from the Shopify admin, then OAuth completes, a session row is stored
      in Neon and the embedded pages load
- [x] Given a new order, then the `orders/create` webhook is accepted (HMAC verified) and the
      customer's refill forecast is updated in Neon (two storefront test orders; an unsigned request
      gets `400`)
- [x] Given a B2B company is updated, then the `companies` webhook syncs it to HubSpot
- [ ] Given the Refill Radar page is opened, then the web pixel settings point to the production
      endpoint and a storefront event is stored. **Open:** the settings point to production, but no
      event reaches the endpoint (see Risks)
- [x] The initial refill load and the B2B sync rebuild the app's tables in the empty production
      database
- [x] A due-soon customer reaches Klaviyo (event) and Flow (`Refill due` trigger); the workflow ran
      once its trigger was selected again (see Risks)
- [x] Secrets live only in Vercel environment variables and the local `.env`; none are committed
- [x] `npm run typecheck`, `npm run lint`, `npm test` and CI pass

## Technical approach

- **Vercel preset.** Add `@vercel/react-router` and `react-router.config.ts` with
  `presets: [vercelPreset()]`. The app's own `app/entry.server.tsx` is kept and checked on
  Vercel (streaming and document headers).
- **App URL.** `app/lib/app-url.server.ts` returns `SHOPIFY_APP_URL` without a trailing slash, or
  `https://${VERCEL_PROJECT_PRODUCTION_URL}`; `shopify.server.ts` and the pixel sync use it.
- **Prisma.** Provider `postgresql`; `DATABASE_URL` is Neon's pooled connection (`-pooler` host,
  PgBouncer) so many short-lived functions share few connections; `DATABASE_URL_UNPOOLED` is the
  direct connection that migrations need. A `connect_timeout` on the URL covers Neon waking from
  scale to zero. Prisma 6 with the standard engine; no driver adapter.
- **Migrations.** The nine SQLite migrations are replaced by one baseline generated with
  `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`.
  Production applies migrations with `prisma migrate deploy` from the deploy procedure, not
  during the Vercel build.
- **Environment variables (Vercel, Production).** `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`,
  `SCOPES`, `SHOPIFY_APP_URL`, `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `KLAVIYO_PRIVATE_KEY`,
  `HUBSPOT_ACCESS_TOKEN`.
- **Data.** The production database starts empty. Shop data (customers, orders, companies,
  metafields) lives in Shopify; the session is recreated by token exchange on the first admin
  load; refill data and CRM sync records are rebuilt with the initial load and the B2B sync, both
  idempotent.
- **CI.** Unchanged steps; `prisma generate` works without a database connection.

Access scopes added: none.

## References

- Shopify — Deploy to a hosting service:
  https://shopify.dev/docs/apps/launch/deployment/deploy-to-hosting-service
- Vercel — React Router on Vercel: https://vercel.com/docs/frameworks/frontend/react-router
- Vercel — Deploy a Shopify app to Vercel: https://vercel.com/kb/guide/deploy-shopify-app-to-vercel
- Vercel — Limits: https://vercel.com/docs/limits
- Neon — Connect from Prisma: https://neon.com/docs/guides/prisma
- Neon — Plans: https://neon.com/docs/introduction/plans

## Risks and open questions

- **Cold starts.** Neon Free suspends compute after 5 minutes idle and Vercel functions scale to
  zero; the first request after a pause is slower. Shopify expects webhook responses within
  5 seconds; to be measured on the first webhook after an idle period.
- **One app for development and production.** The development preview outlives `shopify app dev`:
  until `shopify app dev clean` (or "Clean dev preview" in the Dev Console) the store keeps
  loading the app from the old tunnel. Part of the deploy procedure in the README.
- **Flow workflows and the development preview.** A workflow built on the `Refill due` trigger
  while the preview ran kept listening to the preview trigger: Flow accepted
  `flowTriggerReceive` with no errors and ran nothing. Selecting the trigger again in the
  workflow fixed it (verified with one test trigger; the test tag was removed).
- **Web pixel in production (resolved).** No request reached `/pixel/refill/events` from the
  test browser. The cause was outside the app: a network-level tracker filter on the test
  machine inspected HTTPS (also in private windows) and answered the pixel sandbox worker and
  `/api/collect` with an empty `204`, so no pixel code ran. `curl` received the real worker, and
  the published pixel script matched the local build. With the store allowlisted in the filter,
  the pixel posted and the endpoint answered `204`. The README notes how to spot it.
- **Initial load sends reminders.** Finishing an initial load or a rebuild sends any due
  reminders (Klaviyo and Flow); the README says so.
- **Plan limits.** Vercel Hobby (non-commercial use; functions up to 300 s) and Neon Free (1 GB
  per project, 100 CU-hours per month) pause instead of billing when exceeded.
