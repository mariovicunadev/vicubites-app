# 021 — Estudio Técnico: Refill Radar migration

| Field     | Value |
|-----------|-------|
| Status    | Approved |
| Branch    | `feature/021-estudio-tecnico-refill` |


## Goal

Migrate `/app/refill` to the `.et` system established in specs 019–020 — same
kit, same rules: all display markup app-owned, `s-page`/`s-app-nav` stay as host
chrome, behavior untouched.

## Context

Refill Radar is the densest screen: two forecast tables, a reorders funnel, a
reminders panel with channel badges and an on-demand action, plus five banner
states. Design language and kit approved in spec 020 (mock:
`specs/mocks/020-estudio-tecnico-health.html`); no new mock needed — this spec
reuses the approved components and adds only two banner tones
(`--warning`, `--success`) and small layout helpers (`et-inline`, `et-copy`).

A `TechnicalScene` explanation (customer → order → webhook → reminder) is
intentionally deferred to its own spec; this one is markup only.

## Scope

**In scope**
- New kit classes: `et-banner--warning` (orange left border),
  `et-banner--success` (green-deep left border), `et-inline` (wrapping inline
  cluster for badge+button groups), `et-copy` (padded text block for panels).
- Migrate `app/routes/app.refill.tsx`: action row ("Rebuild from orders"
  primary, "Rewrite forecasts"), all banners → `et-banner` tones, forecast
  tables → `et-table` with `et-badge` due chips, funnel + reminders + explainer
  sections → `et-panel`/`et-copy`, empty state → `et-empty`.
- Keep: all fetcher submits and intents, `useRevalidator` polling, disabled
  states, `shopify://admin/customers/<id>` links, loader/action untouched.

**Out of scope**
- `TechnicalScene`/SVG scenes (own spec).
- Other routes; `s-page`/`s-app-nav` internals.

## Acceptance criteria

- [ ] `/app/refill` renders fully in the system (mono, paper, panels, pastel
  relief) matching the approved kit.
- [ ] Every banner tone renders: missing-definitions warning, rewrite success,
  load/action critical, failed-rebuild critical, running info.
- [ ] "Rebuild from orders", "Rewrite forecasts", "Connect/Reconnect pixel" and
  "Send due reminders" post their intents, disable while running, and the
  rebuild polling still revalidates every 3 s.
- [ ] `runs` feedback line renders after "Send due reminders".
- [ ] Empty state (`total === 0`) renders `.et-empty`; per-section empty copy
  ("No customer is due soon" / "Every forecast is due soon") still shows.
- [ ] Customer links open `shopify://admin/customers/<id>` in `_top`.
- [ ] Keyboard focus outline on all `et-button`s/links; table `<th>` semantics;
  390 px: tables scroll horizontally, inline clusters wrap.
- [ ] `prefers-reduced-motion`: no transitions. No selectors outside `.et`.
- [ ] Access scopes: none added.
- [ ] typecheck, lint, tests, build pass; announced axe pass on the SSR'd route
  (populated + empty) in isolated Chrome: no new violations.

## Technical approach

- `app/styles/estudio-tecnico.css` — add the two banner tones and layout
  helpers listed above.
- `app/routes/app.refill.tsx` — markup swap only; `ForecastTable` → `et-table`,
  badges map `row.tone` to `et-badge--*`; banners → `et-banner` variants.
- No `*.server.ts`, GraphQL or Prisma changes.

Access scopes added: none.

## References

- Specs 019–020 (kit, slot-reparenting lesson, SSR+axe harness pattern).

## Risks and open questions

- `s-badge` "warning" tone maps to `et-badge--caution`; confirm visually.
- Banner `role`: `alert` for critical/success/warning feedback, `status` for
  the in-progress info banner.
