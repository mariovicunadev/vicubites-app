# 023 — Estudio Técnico: Exports and B2B CRM

| Field | Value |
|-------|-------|
| Status | Done |
| Branch | `feature/023-estudio-tecnico-exports-crm` |

## Goal

Give catalog exports and B2B CRM the same readable, paper-based interface as the other operations pages.

## Context

Both pages expose server-side integrations. Exports starts and polls bulk jobs and downloads their CSV through an authenticated fetch. B2B CRM shows HubSpot connection status, sync totals and failures. Their existing behavior stays unchanged. Presentation migration approved as part of the remaining app views.

## Scope

**In scope**
- Native `.et` action buttons, notices, status badges, panels and semantic tables.
- Preserve export polling, job counts, full/partial/expired downloads, App Bridge toast errors and sync submissions.
- Preserve disabled states and expose download busy state with native accessible markup.

**Out of scope**
- Server loaders/actions, integrations, API operations, access scopes, extensions and bulk-fix screens.
- New illustrative scenes that do not explain existing data.

## Acceptance criteria

- [x] Exports retains its running/pending action guards, error banner and empty state.
- [x] All job columns, status/error codes, counts and full/partial/expired result states remain visible.
- [ ] Download uses the existing authenticated fetch, not a plain URL link; busy buttons cannot be activated twice. Existing fetch retained by source review; live download/busy interaction still pending.
- [x] CRM retains connection status, sync availability, summary, result feedback and failure records with UTC dates.
- [x] Tables have column headers and a keyboard-focusable horizontal scroll area at 390 px.
- [x] Native markup is styled under `.et`, with readable copy, visible keyboard focus and reduced motion.
- [x] Typecheck, lint, tests and React Router build pass; announced isolated axe checks cover loaded, empty/error and disconnected states at 1440/390 px.
- [x] Live export and CRM sync checks remain owner-only; no real jobs or external records are created during presentation verification.

## Verification evidence

- 2026-11-23: typecheck, lint, all 351 tests and React Router client/server build pass. Five new SSR presentation tests use mocked loaders, fetchers, App Bridge and server modules; they are outside `app/routes`.
- Isolated Chrome: zero axe WCAG A/AA violations and no page-level horizontal overflow for seven states at both 1440 and 390 px. Loaded pages have visible 3 px keyboard focus, focusable table regions, usable internal horizontal scrolling at 390 px and reduced-motion overrides.
- The native presentation harness supplies a page landmark/title, without Polaris or Shopify authentication. Embedded navigation, real CSV downloads, live sync and final visual approval remain pending in the dev preview. No real jobs, messages or CRM records were created.
- Branch is stacked on local spec 022; no push or merge performed.

## Technical approach

Reuse the established `.et` kit in the two route components. Keep `s-page` as the page host. Tables use `table`, `thead`, `tbody` and `th scope="col"`. Preserve App Bridge and server imports and callbacks.

Access scopes added: none. GraphQL operations changed: none.

## References

- Specs 020–022 and the existing export/CRM route behavior.

## Risks and open questions

- Local branches may be stacked until the preceding visual migrations are merged; review diffs against the immediate parent and integrate in order.
- Isolated presentation checks do not replace navigation and download checks in the Shopify dev preview.
