# 019 — Estudio Técnico visual identity (pilot: Overview)

| Field     | Value |
|-----------|-------|
| Status    | In progress |
| Branch    | `feature/019-estudio-tecnico-visual` |


## Goal

Adopt the owner's "Estudio Técnico" visual system (warm retro-technical: cream
paper, dark ink, pastel accents, monospace type, contained relief) as the Vicubites
Ops interface identity, starting with a single pilot screen: `/app` (Overview).

## Context

Vicubites Ops today renders entirely with Polaris web components (`s-*`) and no
app-owned stylesheet. The owner selected Estudio Técnico as the visual identity for
this app's UI (decision recorded 2026-11-18). Because Polaris components render
inside shadow DOM, the adoption is a scoped CSS layer plus app-owned components for
the visual chrome — not a replacement of Polaris behavior, navigation or forms.
Migration is progressive: this spec covers the design foundation and the pilot
screen only; other routes migrate in later specs.

Source of truth (external design artifact, read-only reference):
`tokens.css` (tokens + shared `.et` components), `motion.mjs` (SVG scene engine,
not used in this spec), `index.html`/`catalog.mjs`/`catalog.css` (demo catalog —
reference only, never imported wholesale).

Approved visual mock: `specs/mocks/019-estudio-tecnico-overview.html`.

## Scope

**In scope**
- New app-owned stylesheet `app/styles/estudio-tecnico.css`: the `--et-*` tokens
  and `.et` components needed by the pilot (panel, tag, metric card, banner,
  focus-visible, reduced-motion guard), copied from `tokens.css` verbatim where
  used. Scoped under `.et`; no global selectors, no `s-*` overrides.
- Load the stylesheet for embedded routes only (links in `app/routes/app.tsx`);
  the login page and extensions are untouched.
- Pilot restyle of `app/routes/app._index.tsx`: paper background, `et-panel`
  metric cards, `et-tag` module badges, `et-panel` connection aside, error state
  keeps `s-banner` (its chrome is host-owned) — final mapping per approved mock.
- Inherited typography: `--et-font` applied at the `.et` root so slotted text
  inside `s-*` components picks up the monospace stack (system fonts only —
  `JetBrains Mono` if installed, `Cascadia Code`/Consolas fallbacks; no font
  files or external services added).

**Out of scope**
- Other routes (`health`, `refill`, `b2b-crm`, `checkout-rules`, `exports`) —
  each gets its own spec after the pilot is verified.
- `motion.mjs` / `TechnicalScene` (no SVG scenes in this spec).
- Storefront theme, checkout and customer-account extensions (different surfaces;
  explicitly excluded by the identity decision).
- Dark theme variant (tokens exist in the source; wiring is deferred).
- Replacing or restyling Polaris component internals, `s-app-nav`, or the
  Shopify admin chrome.

## Acceptance criteria

- [ ] Given the app loads inside the admin, when `/app` renders, then the
  Overview matches the approved mock (paper background, panel metrics, pastel
  module tags, monospace type) while all loader data is unchanged.
- [ ] Given an Admin API failure, when the loader returns an error, then the
  error state is still rendered and readable (banner per mock).
- [ ] Given keyboard navigation, when tabbing through the page, then
  `focus-visible` shows the `.et` outline on app-owned controls.
- [ ] Given `prefers-reduced-motion: reduce`, then no transitions/animations run.
- [ ] Given a 390 px viewport, then the layout stacks correctly (metrics single
  column, aside below content).
- [ ] No visual or behavioral change on `/app/health`, `/app/refill`,
  `/app/b2b-crm`, `/app/checkout-rules`, `/app/exports` beyond inherited
  typography/background (to be confirmed screen by screen during review).
- [ ] No selectors outside `.et`; no global overrides of `s-*` components, `body`
  or the admin.
- [ ] Access scopes: none added.
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass; one announced axe
  pass on `/app` shows no new violations.

## Technical approach

- `app/styles/estudio-tecnico.css` — `.et`-scoped tokens + components, adapted
  from the source `tokens.css`; only the component classes the pilot uses are
  copied (no `catalog.css`).
- `app/routes/app.tsx` — export `links()` adding the stylesheet (React Router
  route-scoped CSS), so it loads on `app.*` routes only.
- `app/routes/app._index.tsx` — wrap content in `.et`, replace the metric
  `s-box`es and module list with the mock's `et-panel`/`et-metric`/`et-tag`
  markup; keep `s-page`, `s-section` semantics and the `s-banner` error state
  unless the approved mock says otherwise.
- No `*.server.ts`, loader, action, GraphQL or Prisma changes.

Access scopes added: none.

## References

- Estudio Técnico artifact: `tokens.css`, `motion.mjs`, `index.html` /
  `catalog.mjs` / `catalog.css`, local skill guide (external path, see decision
  record 2026-11-18).
- React Router `links()` route stylesheet convention.
- Polaris web components shadow-DOM constraint: custom CSS reaches slotted
  content and inherited properties only.

## Risks and open questions

- Inherited `font-family` inside `s-*` shadow roots: expected to apply (inherited
  properties cross shadow boundaries); confirmed in the pilot, fallback is
  styling only slotted nodes.
- Paper background behind `s-page`: depends on where Polaris paints the app
  surface; if the host chrome already paints a background, the `.et` background
  is applied to the page content area instead of `body`.
- Token drift: the stylesheet is a verbatim extract of `tokens.css`; any future
  source change must be ported manually (noted in the file header).
