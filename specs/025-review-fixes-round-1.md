# 025 — Review fixes (round 1)

| Field | Value |
|-------|-------|
| Status | In progress |
| Branch | `feature/025-review-fixes-round-1` |

## Goal

A Spanish-speaking buyer reads the starter kit picker, cart and checkout in Spanish, and staff
know what the bulk fix spreadsheet contains before downloading it.

## Context

- **Picker labels.** The `starter-kit-picker` block renders the labels stored in the app-owned
  shop metafield `$app.starter_kit_picker` (spec 013). The app builds that JSON from product and
  variant titles in the store's primary language, so `/es` shows English recipe and flavor names.
  The translations already exist on the products; a copy of the titles in a metafield doesn't use
  them.
- **"Turquía".** The Spanish value of the "Turkey" option value is "Turquía" (the country) on two
  products, `crunchy-treats-for-cats` and `pate-for-cats`. Checkout and cart read that value
  through the variant, so it's wrong content, not wrong code. A scan of the product, option,
  option value, metaobject, metafield, collection, filter and selling plan translations found no
  other occurrence.
- **Bulk fix.** The template only holds products with at least one fixable failure in the latest
  audit (guaranteed analysis, calories or classification). With few failures it looks like an
  incomplete catalog export.

## Scope

**In scope**
- The block reads each label from the storefront's own product objects, which Shopify returns in
  the buyer's language:
  - recipes: `all_products[option.value].title` (the option value is the product handle);
  - treat flavors: the variant of the treats product with the option's variant ID. The picker
    metafield gains `treatsHandle` and, on each treat, `variantId` (numeric).
- The stored label stays as the fallback when a lookup returns nothing, including a metafield
  saved before this change.
- Spanish value "Pavo" for both "Turkey" option values, registered with `translationsRegister`.
  This is store content: no code in the repo.
- A static info notice in section 1 of `app/routes/app.health_.fix.tsx`.

**Out of scope**
- Option order: it stays sorted by the primary language title in every language.
- Changes to the CSV's content or to a full catalog template (a later bulk fix spec).
- Translating the embedded admin app, which is English only.
- The Cart Transform function and its configuration: no change.

## Acceptance criteria

- [ ] Given the kit page on `/es`, then every recipe and treat flavor in the picker reads in
      Spanish, matching the titles of those products and variants on `/es`, and "Turkey" reads
      "Pavo"
- [ ] Given the kit page on `/`, then the picker reads as before
- [ ] Given a picker metafield without `variantId` (saved before this change), then the picker
      renders every option, with the stored label where no lookup is possible
- [ ] Given a kit added from `/es` with a non-default recipe and the turkey flavor, then the cart
      expands into the chosen products and checkout shows "Pavo"
- [ ] Given `/es` product pages of `crunchy-treats-for-cats` and `pate-for-cats`, then the flavor
      option reads "Pavo"
- [ ] Given the bulk fix page, then section 1 states that the file holds only the products with
      fixable failures in the latest audit, not the whole catalog
- [ ] Access scopes: none added
- [ ] Every `.liquid` file passes theme validation; `npm run typecheck`, `npm run lint`,
      `npm test` and `npx react-router build` pass
- [ ] One axe pass on the kit page (`/es`) and the bulk fix page reports no new violations

## Technical approach

- `app/lib/bundles/starter-kit.ts`: `StarterKitPickerConfig` gains `treatsHandle` and
  `treats[].variantId`. The numeric ID comes from the variant GID, because Liquid's `variant.id`
  is numeric. Unit tests cover the new shape. The function configuration is unchanged, so
  `isOutdated` and the function's contract test are unaffected.
- `extensions/refill-radar/blocks/starter-kit-picker.liquid`: resolve each label with
  `all_products`, falling back to `option.label`. The page uses one unique handle per recipe plus
  one for the treats (7 today), under the limit of 20 per page. A recipe beyond the limit would
  keep its stored label.
- `app/routes/app.health_.fix.tsx`: an `.et-banner.et-banner--info` block, no live region
  (static text).
- Content: `translationsRegister` on the two `ProductOptionValue` resources (key `name`, with
  each `translatableContentDigest`), then a read of the option values and variant titles in `es`.
- Release: deploy the app, run `shopify app deploy`, then **Save** the starter kit in Checkout
  rules so the metafield gets the new fields. That order is safe: until the save, treat flavors
  keep their stored label. No migration.

## References

- https://shopify.dev/docs/api/liquid/objects/all_products
- https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/translationsRegister

## Risks and open questions

- The picker metafield is shared by the development preview and the deployed app: saving from
  either one updates the live value. The new fields are additive, so the released block ignores
  them.
- Running machine translation over these products again could overwrite "Pavo". "Turkey" alone is
  ambiguous without context.
