# 024 — Estudio Técnico: global pass and bulk fix migration

| Field | Value |
|-------|-------|
| Status | Approved |
| Branch | `feature/024-estudio-tecnico-global-pass` |

## Goal

Bring every app view to the current Estudio Técnico finish: a declared type scale with a
readable floor, unified badges and button tiers, tokens re-synced with the design artifact,
and the last unmigrated screen (bulk fix) moved to `.et` markup.

## Context

Specs 019–023 migrated Overview, Data Health, Refill Radar, Checkout rules, Exports and B2B
CRM. The bulk fix flow (`app.health_.fix.tsx`) still renders Polaris `s-*` markup, so it
looks like a different product. Meanwhile the `.et` stylesheet is a 019-era extract: the
artifact's tokens.css gained new tokens since, and the app invented `.et-badge` next to
`.et-tag` plus a third button size inside rule cards without documenting the tiers. The
artifact's skill file forbids shrinking text to dashboard sizes; several views sit at
10–11 px for readable content. Presentation-only pass: loaders, actions, validation, the
preview/apply flow, GraphQL and integrations stay untouched.

## Scope

**In scope**

- Migrate `app.health_.fix.tsx` markup to `.et`: sections, copy, banners, badges, buttons
  and semantic tables. `s-drop-zone` stays (behavior, file picking); `s-page` and its
  breadcrumb link stay.
- Re-sync `app/styles/estudio-tecnico.css` tokens with the current artifact tokens.css
  (contact/shine/bezel and motion tokens), documenting approved divergences in the header.
- Declare the type scale: uppercase micro-labels vs. reading text; raise readable text that
  sits at 10–11 px (badges, table detail, copy that carries meaning).
- Unify `.et-tag`/`.et-badge` into one pill with tone variants and document the two button
  tiers (standard vs. compact, used inside cards/tables).
- Cross-view spacing/typography normalization on the 4 px grid (headings, table cells,
  panels, aside) without touching behavior.

**Out of scope**

- Loaders, actions, form validation, preview/apply logic, CSV template route, GraphQL
  operations, access scopes, extensions, App Bridge wiring.
- Admin dark theme (the admin chrome is fixed; light tokens remain the single theme).
- SVG scenes: nothing on these pages needs a diagram to be understood.
- Push, merge, or any real export/sync/apply run.

## Acceptance criteria

- [ ] Bulk fix keeps its three-step flow (template download, drop zone, review, results),
  authenticated CSV fetches, disabled/busy states, polling and post-fix audit redirect.
- [ ] `s-drop-zone`, `s-page` and breadcrumb link unchanged in behavior; preview and apply
  submit the same intents.
- [ ] Stylesheet tokens match the current artifact set (light theme); divergences are
  documented in the CSS header.
- [ ] One badge/tag component with documented tones; two documented button tiers.
- [ ] No readable text below 11 px; micro-labels are uppercase-only and not the sole carrier
  of essential information.
- [ ] Typecheck, lint, tests and React Router build pass; announced isolated axe checks on
  touched routes at 1440/390 px.
- [ ] No real bulk fix, export, sync or audit runs during verification.

## Technical approach

Edit `app/styles/estudio-tecnico.css` and route markup only. Bulk fix tables reuse
`et-table` + `ScrollRegion`; banners reuse `et-banner` tones; the apply/audit buttons reuse
`et-button` tiers. Presentation tests stay outside `app/routes` (file routing would treat
`*.test.ts` there as routes).

Access scopes added: none. GraphQL operations changed: none.

## References

- Specs 019–023; Estudio Técnico skill and artifact tokens.css (current version).

## Risks and open questions

- Stacked on local spec 023 until 021–023 merge; diff against the immediate parent.
- Embedded admin checks (navigation, real downloads, apply) remain pending in dev preview.
