# NNN — Feature name

| Field     | Value |
|-----------|-------|
| Status    | Draft / Approved / In progress / Done |
| Branch    | `feature/NNN-name` |
| Estimate  | X h |
| Actual    | — |

## Goal

One or two sentences: what this feature delivers and for whom (merchant, staff, B2C customer,
B2B buyer).

## Context

Why it is needed and why it belongs in an app (backend, events, whole-store data or app-only
surfaces). Link related specs.

## Scope

**In scope**
- …

**Out of scope**
- …

## Acceptance criteria

- [ ] Given …, when …, then …
- [ ] Access scopes: only the ones this feature needs, listed below
- [ ] Every Admin GraphQL operation is typed by codegen and validated against the pinned API version
- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass

## Technical approach

Routes, modules under `app/lib/`, Prisma models, Admin API operations, webhooks, extensions.
Access scopes added: …

## References

- Shopify docs consulted (links)

## Risks and open questions

- …
