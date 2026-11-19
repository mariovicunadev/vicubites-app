# 020 — Estudio Técnico component kit + Data health migration

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/020-estudio-tecnico-health` |


## Goal

Extend the `.et` kit with the components a data screen needs (buttons, badges,
progress bars, table, banners, empty state) and migrate `/app/health` fully to the
Estudio Técnico look — the first screen where the whole surface is monospace,
paper and pastel relief.

## Context

Spec 019 proved the model: identity lives in `.et` markup, Polaris `s-*` internals
can't be restyled, and slotted children of `s-page` must be Polaris elements (a
plain `<aside slot>` crashed route unmounts). To reach the intended design level
on content screens, their display markup becomes app-owned `.et` components while
`s-page`, `s-app-nav` and App Bridge stay as host chrome. Related: spec 019.

Approved visual mock: `specs/mocks/020-estudio-tecnico-health.html`.

## Scope

**In scope**
- Extend `app/styles/estudio-tecnico.css` with the new kit classes from the mock:
  `et-badge` (success/neutral/caution/critical/info tones), `et-progress`
  (+ success variant), `et-table`, `et-empty`, `et-banner` tones
  (`--info`, existing `--critical`), `et-metric__value--sm`, `et-rule` rows.
  Only classes with an owner — no speculative API.
- Migrate `app/routes/app.health.tsx` markup to `.et`: metrics, rule bars,
  products table, banners, empty state, action row ("Run audit" /
  "Fix in bulk") rendered as `et-button`s inside the content (the `s-page`
  action slots stay unused — plain elements in slots reparent and crash, see
  spec 019 findings). `s-page` keeps its heading and layout role.
- Keep all behavior: `useFetcher` submit, polling `useRevalidator`, disabled
  state, `shopify://admin` deep links (plain `<a target="_top">`), loader and
  action untouched.

**Out of scope**
- Other routes (`refill`, `b2b-crm`, `checkout-rules`, `exports`,
  `health/fix*` flows) — later specs reuse the same kit.
- `TechnicalScene`/SVG scenes, dark theme, any `s-*` internal restyling.
- Changes to loaders, actions, `app/lib/`, Prisma or GraphQL.

## Acceptance criteria

- [x] `/app/health` renders the approved mock: mono type throughout, paper
  background, metric panels, rule rows with bordered progress bars, `.et`
  table with tone badges, `.et` banners and empty state.
- [x] "Run audit" posts the action and disables while running (fetcher state
  or `audit.running`), the polling `useEffect` still revalidates every 3 s,
  and both info and critical banners render their `.et` variants.
- [x] "Fix in bulk" still navigates to `/app/health/fix`; product links still
  open `shopify://admin/products/<id>` in `_top`.
- [x] Empty state (`summary.products === 0`) renders `.et-empty` with a working
  "Run audit" button.
- [x] Keyboard: every `et-button`/link shows the `.et` focus outline (verified:
  solid 3px outline on Tab); table keeps `<th>` semantics; progress bars carry
  `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`/
  `aria-label` (verified in DOM).
- [x] `prefers-reduced-motion`: no transitions (global `.et` guard). 390 px:
  metrics stack, table scrolls horizontally inside its panel (`overflow-x`,
  scrollWidth 351 > clientWidth 308).
- [x] No selectors outside `.et`; no `s-*` styling beyond the existing
  host-level font rule; `s-page`/`s-app-nav` unchanged.
- [x] Access scopes: none added.
- [x] `npm run typecheck`, `npm run lint`, `npm test` (340),
  `npx react-router build` pass; announced axe pass on `/app/health`
  (populated + empty states, 1440 and 390 px, isolated Chrome on SSR'd markup
  from the real route): **0 violations**.

## Technical approach

- `app/styles/estudio-tecnico.css` — append the new `.et` component classes
  (per mock; new pieces documented in the file header comment).
- `app/routes/app.health.tsx` — replace `Metric`, `RuleBar`, `ProductsTable`
  and the section markup with `.et` markup; `<s-progress>` becomes a
  `role="progressbar"` div; actions move from `s-page` slots to an `.et`
  actions row (primary on the right per mock).
- No `*.server.ts`, GraphQL or Prisma changes. New tests not expected (markup
  only); existing 340 must stay green.

Access scopes added: none.

## References

- Spec 019 (visual layer + findings: shadow DOM limits, `slot` reparenting,
  headless SSR+axe harness pattern).
- Estudio Técnico artifact `tokens.css` (source of truth for primitives).
- React Router `useFetcher`/`useRevalidator` (unchanged behavior).

## Risks and open questions

- Action buttons inside content lose the `s-page` header position; mock shows
  them top-right of the content area — approved there. Keeping `s-button` in
  the slots is the fallback if the owner prefers the header placement.
- `et-table` in a narrow panel needs `overflow-x: auto` on the wrapper —
  covered in criteria.
- Score badge tones reuse the existing `row.tone` mapping; confirm the
  `critical`/`caution`/`success` palette against the mock's contrast.
