# 013 — Starter kit bundles (native fixed bundle vs. Cart Transform)

| Field     | Value |
|-----------|-------|
| Status    | In progress |
| Branch    | `feature/013-starter-kit-bundles` |
| Estimate  | 3–4 h (AI-assisted) · 8–10 h manual |
| Actual    | — |

## Goal

Two starter kits for new B2C customers, each built with a different Shopify bundle model, so the
store can compare them side by side:

- **Dog Starter Kit (Kit A, native fixed bundle):** always the same two products at a fixed price.
  Shopify handles the bundle natively; no function runs.
- **Cat Starter Kit (Kit B, customized bundle):** the customer picks a dry food recipe and a treat
  flavor on the product page. A Cart Transform Function expands the kit in the cart into the
  chosen products, so stock, fulfillment and reporting work per product.

## Context

Shopify offers two bundle models:

- **Fixed bundles** link a parent variant to its component variants (`productVariantComponents`).
  The parent variant sets the price; availability comes from the components' inventory. They
  need no code at checkout, but every buyer gets the same components.
- **Customized bundles** use a Cart Transform Function. The function reads the cart and returns
  operations (`lineExpand`, `linesMerge`, `lineUpdate`). With `lineExpand`, one cart line becomes
  a group of component lines, priced by the function. This supports choices the native model
  can't express.

Building one kit per model shows when each is the right tool: the native model when the contents
never change, a function when the buyer chooses. The kit is a single variant with a fixed price
in both cases; the choice in Kit B is carried by line attributes, not by product options (six
recipes × three flavors would be 18 variants to keep in stock and price).

Related: [spec 012](012-discount-validation-functions.md) added the `/app/checkout-rules` page
and the pattern of configuring a function through an `$app` metafield on its instance.

## Scope

**In scope**

- **Kit A — "Dog Starter Kit"** (product created through the Admin API, tagged `starter-kit`):
  - One variant whose components are Adult Chicken & Brown Rice 2 kg (×1) and Training Treats
    Chicken (×1), linked with `productVariantRelationshipBulkUpdate`.
  - `priceInput.calculation: FIXED`, about 10 % below the sum of the components' prices.
  - No Shopify Bundles app is installed: the bundle is created by the API.
- **Kit B — "Cat Starter Kit"** (product created through the Admin API, tagged `starter-kit`):
  - One variant, fixed price (about 10 % below the typical sum of its components),
    `requiresComponents: true`, inventory not tracked on the parent (stock lives on the
    components). No `productVariantRelationshipBulkUpdate`: the components come from the function.
  - **App block** `starter-kit-picker` in the app's theme extension, for the product template: two
    selects (dry cat food recipe: the six 1.5 kg dry cat foods; treat flavor: three options) that
    add two line item properties to the add-to-cart request, `_kit_recipe` and `_kit_treat`
    (underscore prefix: hidden from the buyer in the cart and checkout; the expanded lines show the
    choice instead). The options and their labels come from the same configuration the function
    reads, so the block can't offer a choice the function doesn't know.
  - **Function extension** `starter-kit-expand` (Cart Transform Function API, target
    `cart.transform.run`, TypeScript):
    - For each line whose variant is the configured kit variant, returns one `lineExpand` with the
      chosen recipe (×1) and treat (×1) as expanded items.
    - Price: the kit's line price per unit is split across the components in proportion to their
      list prices (`fixedPricePerUnit`, in the cart's presentment currency). Amounts are rounded
      to cents and the rounding remainder goes to the last component, so the parts always add up
      to the kit price exactly.
    - Missing or unknown attribute → the configured default recipe or flavor. Missing or invalid
      configuration → no operations. The function never throws on cart data.
    - Configuration in the Cart Transform's `$app.starter-kit-config` JSON metafield: the kit
      variant ID, the recipe and treat options (variant ID, label, list price used as weight) and
      the defaults.
- **App page `/app/checkout-rules`**, new section "Bundles": status of the Cart Transform (active or
  not, the kit it expands, number of options) and a button that creates it (`cartTransformCreate`
  with the configuration metafield, `blockOnFailure: false`) or rewrites its configuration
  (`metafieldsSet`). The configuration is built on the server from the store's products (by
  handle), so the list prices in it are current when it's saved.
- Access scope `write_cart_transforms`.
- Unit tests: price split (exact sum, rounding, one and several units), attribute parsing and
  defaults, lines that aren't the kit, missing config, configuration builder.
- README section "Bundles: native vs. Cart Transform": what each model is, how each kit is built,
  trade-offs, instruction count.
- Production: app version with the function (`shopify app deploy`), develop deployment promoted in
  Vercel, Cart Transform created from the production app.

**Out of scope**

- `linesMerge` and `lineUpdate` (`lineUpdate` is limited to Plus and development stores).
- Subscriptions: Shopify rejects bundle operations on lines with a selling plan, so both kits are
  one-time purchases only.
- B2B: the kits are not added to B2B catalogs.
- POS, custom storefronts, and a merchant UI to edit kit contents (the configuration is rebuilt
  from fixed product handles).
- Installing the Shopify Bundles app.

## Acceptance criteria

- [ ] `bundlesFeature` confirms the store can publish bundles before the kits are published.
- [ ] Given Kit A on the storefront, when a customer adds it to the cart, then the cart shows the
      kit at its fixed price and checkout lists its two components; availability follows the
      components' stock.
- [ ] Given Kit B with a recipe and flavor chosen in the app block, when it's added to the cart,
      then the cart line expands into exactly that recipe and that treat, and their prices add up
      to the kit price.
- [ ] Given Kit B added without attributes or with an unknown value (for example through the Ajax
      API), then it expands into the default recipe and flavor and the cart still works.
- [ ] Given two Kit B lines with different choices, then each expands into its own components.
- [ ] Lines that aren't Kit B are never changed by the function, and missing or invalid
      configuration returns no operations (unit tests).
- [ ] A test order with Kit B shows the components as order lines linked to the kit, the fulfillment
      order lists the components, and the components' inventory goes down (not the parent's).
      The test order is announced before it's placed and deleted afterwards.
- [ ] `/app/checkout-rules` shows the Cart Transform's status, creates it when missing and rewrites
      its configuration; changes take effect without a redeploy.
- [ ] Instruction count of the function, measured with `shopify app function run` on the largest
      fixture, is recorded in the README.
- [ ] Access scopes: only `write_cart_transforms` added.
- [ ] Every Admin GraphQL operation and the function input query are validated against API version
      2026-10, and Admin operations are typed by codegen.
- [ ] `npm run typecheck`, `npm run lint`, `npm test`, `npx react-router build` and
      `shopify app function build` pass.
- [ ] Deployed to production: new app version, Vercel promotion of `develop`, Cart Transform created
      from the production app and read back through the Admin API; both kits verified in a
      storefront cart.
- [ ] One axe pass on `/app/checkout-rules` (Bundles section): 0 violations. README section
      "Bundles: native vs. Cart Transform" added.

## Technical approach

**Kit products** (one-off Admin GraphQL operations, documented in the README and run with
`shopify store execute`):

- Kit A: `productCreate` → `productVariantRelationshipBulkUpdate` (`parentProductVariantId`,
  `productVariantRelationshipsToCreate`, `priceInput { calculation: FIXED, price }`).
- Kit B: `productCreate` → `productVariantsBulkUpdate` (`price`, `requiresComponents: true`,
  `inventoryItem.tracked: false`).
- Both tagged `starter-kit`, published to the Online Store, not added to B2B catalogs.

**Function** `extensions/starter-kit-expand/` (generated with `shopify app generate extension`,
TypeScript template):

- `src/cart_transform_run.graphql`: `cart.lines` (`id`, `quantity`, `cost.amountPerQuantity`,
  `merchandise { ... on ProductVariant { id } }`, `attribute(key: "_kit_recipe")`,
  `attribute(key: "_kit_treat")`) and `cartTransform.metafield(namespace: "$app",
  key: "starter-kit-config") { jsonValue }`.
- `src/cart_transform_run.ts`: returns `operations` with one `lineExpand` per kit line
  (`cartLineId`, `expandedCartItems` with `merchandiseId`, `quantity` and
  `price.adjustment.fixedPricePerUnit.amount`).
- Pure logic (config parsing, choice resolution, price split) in small exported functions, tested
  directly in Vitest.

**App block** `extensions/<theme extension>/blocks/starter-kit-picker.liquid`: renders the selects
from the configuration (exposed to Liquid through an app-owned shop metafield written alongside the
Cart Transform configuration) and ties them to the product form, so the values are sent as
`properties[_kit_recipe]` and `properties[_kit_treat]`. Validated with `tools/validate.mjs`
(`--context theme`).

**App:**

- `app/routes/app.checkout-rules.tsx`: new "Bundles" section in the loader and action.
- `app/lib/bundles/`: configuration types, builder (products by handle → config), parsing shared
  with the tests, and Admin operations (`cartTransforms`, `cartTransformCreate`, `metafieldsSet`).
- Access scope added: `write_cart_transforms` (the owner approves the update in the admin).

**Rollout:** develop against the dev preview (`shopify app dev`), verify, clean the dev preview,
deploy, promote `develop` in Vercel, then create the Cart Transform from the production app.

## References

- Bundles overview: https://shopify.dev/docs/apps/build/product-merchandising/bundles
- Add a variant fixed bundle:
  https://shopify.dev/docs/apps/build/product-merchandising/bundles/add-variant-fixed-bundle
- Add a customized bundle function:
  https://shopify.dev/docs/apps/build/product-merchandising/bundles/add-customized-bundle-function
- Cart Transform Function API (2026-10): https://shopify.dev/docs/api/functions/2026-10/cart-transform
- `productVariantRelationshipBulkUpdate`, `PriceInput`, `ProductVariantSetInput.requiresComponents`
  (Admin GraphQL 2026-10)
- Metafields for input queries:
  https://shopify.dev/docs/apps/build/functions/input-queries/metafields-for-input-queries

## Risks and open questions

- A store has one Cart Transform per app. Future bundle logic in this app goes into the same
  function and configuration.
- The docs don't state how inventory and fulfillment work for customized bundles; they say order
  lines return the components with a reference to the parent. The parent is left untracked and
  the test order checks the real behavior; the spec is updated with what it shows.
- `requiresComponents: true` hides Kit B from channels that don't support bundles and drops it from
  the cart if the function doesn't expand it. `blockOnFailure: false` keeps checkout open if the
  function fails, so a failing function removes the kit instead of blocking the order.
- Kit prices are fixed while the components' list prices can change; the split weights are
  refreshed only when the configuration is saved again.
- The docs recommend `productBundleCreate` for most fixed bundles. Kit A uses
  `productVariantRelationshipBulkUpdate` because it's a single-variant kit with a fixed price
  (`priceInput: FIXED`).
- After an app assigns bundle components, only that app can manage them: Kit A's components are
  edited through this app's operations, not the admin bundle editor.
