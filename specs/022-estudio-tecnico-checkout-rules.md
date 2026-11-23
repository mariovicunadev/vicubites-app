# 022 — Estudio Técnico: Checkout rules migration

| Field     | Value |
|-----------|-------|
| Status    | Done |
| Branch    | `feature/022-estudio-tecnico-checkout-rules` |


## Goal

Migrate `/app/checkout-rules` to the `.et` system, adding form controls to the
kit (labeled fields, number inputs, field errors) — specs 019–021 pattern.

## Context

Three rule cards (Refill reward, Order limit, Bundles), each a `fetcher.Form`
with status badges, explanatory copy, inline banners and a submit. The number
fields become `.et-field` + `et-input` with server-driven `fieldErrors`
rendered as `.et-field__error` + `aria-invalid`/`aria-describedby`. Design
language approved in spec 020; no new mock needed.

## Scope

**In scope**
- New kit classes: `et-field` (label + control + suffix + error),
  `et-field__error`, invalid `et-input` state, `et-form` (vertical stack).
- Migrate `app/routes/app.checkout-rules.tsx`: `StatusBadge`/`BundlesBadge` →
  `et-badge` tones, `FormFeedback` → `et-banner`, field errors → `.et-field`,
  lists → `<ul>`, submits → `et-button--primary`.
- Keep: `fetcher.Form` wiring, hidden `intent` inputs, `name`s,
  `defaultValue`, `min`/`max` and all disabled logic; loader/action untouched.

**Out of scope**
- `health/fix*` flows, exports, b2b-crm (separate spec).
- Changing validation in `app/lib/checkout-rules/settings.ts`.

## Acceptance criteria

- [x] All three cards render in the system (mono, paper, panels) per the kit.
- [x] Each form posts its `intent`, shows field errors on the matching input
  (`.et-field__error` + `aria-invalid`), disables while submitting, and shows
  success/critical `et-banner` feedback.
- [x] Bundles: eligibility banner, problems list, picker counts and the
  "Turn on starter kit"/"Save" states all render.
- [x] Load failure path (`!rules || !bundles`) renders the critical banner.
- [x] Keyboard focus visible; labels are `<label htmlFor>`/`id` pairs.
- [x] 390 px: cards stack, inputs stay usable; `prefers-reduced-motion` clean.
- [x] No selectors outside `.et`. Access scopes: none added.
- [x] typecheck, lint, tests, build pass; announced axe pass on the SSR'd route
  (populated + load-error) in isolated Chrome: no new violations.

## Verification evidence

- 2026-11-23: typecheck, lint, 346 tests and React Router client/server build pass.
- Six presentation tests cover populated, validation, feedback, pending, missing and load-error states with mocked route hooks. They do not execute live mutations.
- Isolated Chrome: zero axe WCAG A/AA violations and no page overflow for all six states at 1440 and 390 px. Native form serialization, first input keyboard focus (3 px outline), and reduced-motion transition override pass.
- The harness provides the page landmark/title and does not load Polaris or authenticate against Shopify. Embedded navigation, real saves and final visual approval remain pending in the owner's dev preview.
- Branch is stacked on spec 021 while PR #27 is open; integrate after that PR, then target `develop`. No push or merge performed for this spec.

## Compact layout follow-up

Owner-requested refinement: keep explanatory copy at 13 px, reduce card padding to 16 px and form gaps to 12 px, place the two reward fields side by side when space permits, and use bounded 220 px fields with compact 34 px inputs and 32 px buttons. Wrap fields on narrow screens. Keep labels, errors, intents, constraints, focus and disabled states unchanged. Scoped to checkout rule cards; no other page density changes in this follow-up.

Verified locally on 2026-11-23: typecheck, lint, 351 tests and client/server build pass. Isolated Chrome confirms the compact dimensions, side-by-side fields at 1440 px, stacked fields at 390 px, visible keyboard focus, reduced motion and zero axe violations in all six fixture states. Follow-up is recorded on the current stacked spec 023 branch; final embedded review remains pending.

## Technical approach

- `app/styles/estudio-tecnico.css` — add `et-form`, `et-field`, error states.
- `app/routes/app.checkout-rules.tsx` — markup swap only.

Access scopes added: none.

## Risks and open questions

- `s-number-field` steppers are lost with plain `type="number"` inputs —
  native spinners remain; acceptable per mock.
- Field error text color `var(--et-error)` on `--et-paper`/`--et-sheet`:
  contrast verified in the axe pass.
