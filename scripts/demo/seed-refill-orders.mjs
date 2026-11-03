// Creates demo customers and paid orders for Refill Radar: single-order
// buyers, regular reorderers, one customer due soon, one overdue, a dog-and-cat
// home and one buyer of wet food and treats only (no forecast expected).
//
// Every order is tagged, sends no email and bypasses inventory. Dates are
// relative to the day the script runs and stay inside the 60-day window that
// `read_orders` covers. Safe to re-run: each order has a stable
// `sourceIdentifier` and existing ones are skipped.
//
// Runs through the app's own token (`shopify app execute`), not Shopify CLI's
// store auth: orderCreate only accepts offline tokens, and `store auth` stores
// an online one. The app doesn't request `write_orders`, so add it to
// `shopify.app.toml` locally while seeding (never commit it), then remove it
// and confirm the installation no longer has it.
//
// Usage: node scripts/demo/seed-refill-orders.mjs [--store <domain>] [--webhook-test]
//   --webhook-test  creates one extra order dated now, to check orders/create.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), "vicubites-demo-"));
const args = process.argv.slice(2);
const STORE = args.includes("--store") ? args[args.indexOf("--store") + 1] : "vicubites.myshopify.com";
const WEBHOOK_TEST = args.includes("--webhook-test");
const TAG = "demo-refill-radar";
const DAY_MS = 24 * 60 * 60 * 1000;

let calls = 0;
function gql(file, variables = {}) {
  calls += 1;
  const varsFile = join(TMP, `vars-${calls}.json`);
  const outFile = join(TMP, `out-${calls}.json`);
  writeFileSync(varsFile, JSON.stringify(variables));
  const cliArgs = [
    "app", "execute", "--store", STORE, "--version", "2026-10", "--no-input",
    "--query-file", join(HERE, "graphql", file), "--variable-file", varsFile, "--output-file", outFile,
  ];
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  try {
    // On Windows the CLI is a .cmd shim, which needs a shell.
    if (process.platform === "win32") {
      execFileSync(`shopify ${cliArgs.map((a) => `"${a}"`).join(" ")}`, { ...options, shell: true });
    } else {
      execFileSync("shopify", cliArgs, options);
    }
  } catch (error) {
    // GraphQL errors arrive inside the CLI's progress output: surface the message only.
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    const message = output.match(/"message":\s*"([^"]+)"/)?.[1] ?? "see the CLI output";
    throw new Error(`${file}: ${message}`);
  }
  const result = JSON.parse(readFileSync(outFile, "utf8"));
  return result.data ?? result;
}

// [handle, option value] → one line item; the option is `Size` for dry food,
// `Pack` (with flavor) for wet food and `Flavor` for treats.
const DOG_CHICKEN = "adult-chicken-and-brown-rice-recipe-dry-dog-food";
const DOG_TURKEY = "adult-turkey-and-pumpkin-recipe-dry-dog-food";
const DOG_SENIOR = "senior-turkey-and-brown-rice-recipe-dry-dog-food";
const DOG_PUPPY = "puppy-chicken-and-oat-recipe-dry-dog-food";
const CAT_SALMON = "adult-salmon-recipe-dry-cat-food";
const CAT_KITTEN = "kitten-chicken-recipe-dry-cat-food";
const WET_DOG = "hearty-stew-for-dogs";
const TREATS_DOG = "training-treats-for-dogs";

const customer = (key, firstName) => ({
  email: `refill-demo-${key}@example.com`,
  firstName,
  lastName: "Demo",
  tags: [TAG],
});

// Expected forecasts (reference: dog 900 kcal/day, cat 250 kcal/day) in comments.
const CUSTOMERS = [
  {
    // One order, estimate: 7 kg × 3700 kcal/kg ÷ 900 ≈ 28.8 days → due in ~9 days
    customer: customer("ana", "Ana"),
    orders: [
      { daysAgo: 20, lines: [[DOG_CHICKEN, "7 kg", 1], [TREATS_DOG, "Chicken", 2]] },
    ],
  },
  {
    // Cadence every 26 days → runs out in ~21 days
    customer: customer("bruno", "Bruno"),
    orders: [
      { daysAgo: 57, lines: [[DOG_TURKEY, "7 kg", 1]] },
      { daysAgo: 31, lines: [[DOG_TURKEY, "7 kg", 1]] },
      { daysAgo: 5, lines: [[DOG_TURKEY, "7 kg", 1]] },
    ],
  },
  {
    // Cadence: intervals 24 and 23 → median 23.5 days → runs out in ~20 days
    customer: customer("carla", "Carla"),
    orders: [
      { daysAgo: 50, lines: [[CAT_SALMON, "1.5 kg", 1]] },
      { daysAgo: 26, lines: [[CAT_SALMON, "1.5 kg", 1]] },
      { daysAgo: 3, lines: [[CAT_SALMON, "1.5 kg", 1]] },
    ],
  },
  {
    // Dog and cat. Dog: 2 kg × 3900 ÷ 900 ≈ 8.7 days → due in ~3 days (earliest).
    // Cat: 4 kg × 4100 ÷ 250 = 65.6 days → runs out in ~36 days.
    customer: customer("diego", "Diego"),
    orders: [
      { daysAgo: 30, lines: [[CAT_KITTEN, "4 kg", 1]] },
      { daysAgo: 6, lines: [[DOG_PUPPY, "2 kg", 1]] },
    ],
  },
  {
    // Cadence every 18 days, last order 22 days ago → ran out ~4 days ago
    customer: customer("elena", "Elena"),
    orders: [
      { daysAgo: 58, lines: [[DOG_SENIOR, "7 kg", 1]] },
      { daysAgo: 40, lines: [[DOG_SENIOR, "7 kg", 1]] },
      { daysAgo: 22, lines: [[DOG_SENIOR, "7 kg", 1]] },
    ],
  },
  {
    // Wet food and treats only → no forecast
    customer: customer("felipe", "Felipe"),
    orders: [
      { daysAgo: 10, lines: [[WET_DOG, "Chicken / 12 cans", 1], [TREATS_DOG, "Beef", 1]] },
    ],
  },
];

if (WEBHOOK_TEST) {
  // Ana reorders today: her forecast switches from estimate to cadence (20 days).
  CUSTOMERS[0].orders.push({ daysAgo: 0, lines: [[DOG_CHICKEN, "7 kg", 1]] });
}

const handles = [...new Set(CUSTOMERS.flatMap((c) => c.orders.flatMap((o) => o.lines.map(([h]) => h))))];
const sources = gql("refill-sources.graphql", {
  productQuery: handles.map((handle) => `handle:${handle}`).join(" OR "),
  orderQuery: `tag:${TAG}`,
});
const existing = new Set(sources.orders.nodes.map((order) => order.sourceIdentifier));

/** Finds the variant whose option values, joined with " / ", match the label. */
function variantId(handle, label) {
  const product = sources.products.nodes.find((node) => node.handle === handle);
  const variant = product?.variants.nodes.find(
    (node) => node.selectedOptions.map((option) => option.value).join(" / ") === label,
  );
  if (!variant) throw new Error(`No variant "${label}" on ${handle}`);
  return variant.id;
}

const OPTIONS = { inventoryBehaviour: "BYPASS", sendReceipt: false, sendFulfillmentReceipt: false };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Creates one order; development stores throttle order creation, so wait and retry. */
async function createOrderWithRetry(order) {
  for (let attempt = 1; ; attempt += 1) {
    const result = gql("seed-order.graphql", { order, options: OPTIONS });
    const throttled = result.orderCreate.userErrors.some((error) => /too many attempts/i.test(error.message));
    if (!throttled || attempt === 5) return result;
    console.log("  throttled, waiting 60 s…");
    await sleep(60_000);
  }
}

const now = Date.now();
let created = 0;
for (const { customer: buyer, orders } of CUSTOMERS) {
  for (const { daysAgo, lines } of orders) {
    const key = buyer.email.split("@")[0];
    const sourceIdentifier = `${key}-${daysAgo === 0 ? "webhook-test" : `d${daysAgo}`}`;
    if (existing.has(sourceIdentifier)) {
      console.log(`· ${sourceIdentifier} already exists`);
      continue;
    }
    const { orderCreate } = await createOrderWithRetry({
      customer: { toUpsert: buyer },
      email: buyer.email,
      lineItems: lines.map(([handle, label, quantity]) => ({
        variantId: variantId(handle, label),
        quantity,
      })),
      financialStatus: "PAID",
      processedAt: new Date(now - daysAgo * DAY_MS).toISOString(),
      sourceIdentifier,
      tags: [TAG],
    });
    if (orderCreate.userErrors.length > 0) {
      throw new Error(`${sourceIdentifier}: ${JSON.stringify(orderCreate.userErrors)}`);
    }
    created += 1;
    console.log(`+ ${orderCreate.order.name} ${sourceIdentifier} (${orderCreate.order.processedAt.slice(0, 10)})`);
  }
}
console.log(`${created} order(s) created, tagged ${TAG}.`);
