// Creates five DRAFT products with incomplete nutrition data, the way new
// recipes arrive from a supplier feed before anyone completes them. They give
// Nutrition Data Health something to flag without touching the live catalog,
// and stay off the storefront because they're drafts.
//
// Runs through Shopify CLI's store auth (`shopify store execute`), not the
// app's access scopes. Safe to re-run: productSet upserts by handle.
//
// Images are uploaded as new files. Passing the CDN URL of an existing file
// to productSet links that same file, and alt text lives on the file, so a
// demo product would rewrite the alt text of a live product's image.
//
// Usage: node scripts/demo/seed-incomplete-products.mjs [--store <domain>]
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), "vicubites-demo-"));
const args = process.argv.slice(2);
const STORE = args.includes("--store") ? args[args.indexOf("--store") + 1] : "vicubites.myshopify.com";
const TAG = "demo-incomplete-data";

let calls = 0;
function gql(file, variables = {}) {
  calls += 1;
  const varsFile = join(TMP, `vars-${calls}.json`);
  writeFileSync(varsFile, JSON.stringify(variables));
  const cliArgs = [
    "store", "execute", "--store", STORE, "--json", "--allow-mutations",
    "--query-file", join(HERE, "graphql", file), "--variable-file", varsFile,
  ];
  // Progress events go to stderr; capture it so they don't clutter the output.
  const options = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  // On Windows the CLI is a .cmd shim, which needs a shell.
  const stdout = process.platform === "win32"
    ? execFileSync(`shopify ${cliArgs.map((a) => `"${a}"`).join(" ")}`, { ...options, shell: true })
    : execFileSync("shopify", cliArgs, options);
  return JSON.parse(stdout);
}

const metafield = (key, type, value) => ({ namespace: "custom", key, type, value });
const analysis = ({ protein, fat, fiber, moisture }) =>
  [
    protein && metafield("protein_min", "number_decimal", protein),
    fat && metafield("fat_min", "number_decimal", fat),
    fiber && metafield("fiber_max", "number_decimal", fiber),
    moisture && metafield("moisture_max", "number_decimal", moisture),
  ].filter(Boolean);

const sources = gql("demo-sources.graphql");
const imageUrl = sources.products.nodes[0]?.media.nodes[0]?.image?.url;
const ingredientIds = sources.metaobjects.nodes.map((node) => node.id);
if (!imageUrl || ingredientIds.length < 2) {
  throw new Error("Expected an active product image and at least two ingredient entries.");
}
// Products declare `{ alt }`; each one gets its own uploaded copy before productSet.
const image = (alt) => ({ alt });

const source = await fetch(imageUrl);
if (!source.ok) throw new Error(`Image download failed with HTTP ${source.status}`);
const imageBytes = new Uint8Array(await source.arrayBuffer());
const imageType = source.headers.get("content-type") ?? "image/jpeg";
const imageExtension = imageType.split("/")[1]?.split(";")[0] ?? "jpg";

/** Uploads a copy of the source image through a staged upload; returns its resource URL. */
async function uploadCopy(filename) {
  const { stagedUploadsCreate } = gql("staged-upload.graphql", {
    input: [{
      filename,
      mimeType: imageType,
      httpMethod: "POST",
      resource: "IMAGE",
      fileSize: String(imageBytes.byteLength),
    }],
  });
  if (stagedUploadsCreate.userErrors.length > 0) {
    throw new Error(`stagedUploadsCreate: ${JSON.stringify(stagedUploadsCreate.userErrors)}`);
  }
  const [target] = stagedUploadsCreate.stagedTargets;
  const form = new FormData();
  for (const { name, value } of target.parameters) form.append(name, value);
  form.append("file", new Blob([imageBytes], { type: imageType }), filename);
  const upload = await fetch(target.url, { method: "POST", body: form });
  if (!upload.ok) throw new Error(`Upload of ${filename} failed with HTTP ${upload.status}`);
  return target.resourceUrl;
}
const sizes = (...variants) => ({
  productOptions: [{ name: "Size", values: variants.map(([size]) => ({ name: size })) }],
  variants: variants.map(([size, price, sku]) => ({
    optionValues: [{ optionName: "Size", name: size }],
    price,
    ...(sku ? { inventoryItem: { sku } } : {}),
  })),
});

// Each product misses a different mix of data; expected scores in comments.
const PRODUCTS = [
  {
    // Missing: guaranteed analysis (fiber, moisture), ingredients, image alt → 50
    handle: "demo-grain-free-beef-recipe-dry-dog-food",
    title: "Grain-Free Beef Recipe",
    productType: "Dry Dog Food",
    seo: { title: "Grain-Free Beef Recipe | Vicubites", description: "Dry dog food made with beef." },
    ...sizes(["2 kg", "24.99", "VB-D-ADU-BEF-G020"], ["7 kg", "59.99", "VB-D-ADU-BEF-G070"]),
    metafields: [
      ...analysis({ protein: "28.0", fat: "16.0" }),
      metafield("kcal_per_kg", "number_integer", "3750"),
      metafield("species", "single_line_text_field", "Dog"),
      metafield("life_stage", "single_line_text_field", "Adult"),
      metafield("food_type", "single_line_text_field", "Dry"),
      metafield("main_protein", "single_line_text_field", "Beef"),
    ],
    files: [image("")],
  },
  {
    // Missing: calories, classification (life stage, main protein), one SKU → 65
    handle: "demo-senior-salmon-pate-wet-cat-food",
    title: "Senior Salmon Pâté",
    productType: "Wet Cat Food",
    seo: { title: "Senior Salmon Pâté | Vicubites", description: "Wet cat food for senior cats." },
    ...sizes(["85 g", "1.99", "VB-C-SEN-SAL-085"], ["12 × 85 g", "21.99", null]),
    metafields: [
      ...analysis({ protein: "10.0", fat: "5.0", fiber: "1.0", moisture: "80.0" }),
      metafield("ingredients", "list.metaobject_reference", JSON.stringify(ingredientIds.slice(0, 2))),
      metafield("species", "single_line_text_field", "Cat"),
      metafield("food_type", "single_line_text_field", "Wet"),
    ],
    files: [image("Senior Salmon Pâté wet cat food, 85 g can")],
  },
  {
    // Missing: images, SEO → 85
    handle: "demo-freeze-dried-liver-bites-dog-treats",
    title: "Freeze-Dried Liver Bites",
    productType: "Dog Treats",
    ...sizes(["100 g", "8.99", "VB-D-TRT-LIV-100"]),
    metafields: [
      ...analysis({ protein: "55.0", fat: "12.0", fiber: "1.5", moisture: "5.0" }),
      metafield("ingredients", "list.metaobject_reference", JSON.stringify(ingredientIds.slice(0, 1))),
      metafield("kcal_per_kg", "number_integer", "3600"),
      metafield("species", "single_line_text_field", "Dog"),
      metafield("life_stage", "single_line_text_field", "Adult"),
      metafield("food_type", "single_line_text_field", "Treats"),
      metafield("main_protein", "single_line_text_field", "Beef"),
    ],
    files: [],
  },
  {
    // Placeholder from the feed: only the species is filled in → 15
    handle: "demo-kitten-turkey-recipe-dry-cat-food",
    title: "Kitten Turkey Recipe",
    productType: "Dry Cat Food",
    ...sizes(["1.5 kg", "19.99", "VB-C-KIT-TRK-015"]),
    metafields: [metafield("species", "single_line_text_field", "Cat")],
    files: [],
  },
  {
    // Missing: alt text on one of two images → 90
    handle: "demo-large-breed-puppy-lamb-recipe-dry-dog-food",
    title: "Large Breed Puppy Lamb Recipe",
    productType: "Dry Dog Food",
    seo: {
      title: "Large Breed Puppy Lamb Recipe | Vicubites",
      description: "Dry dog food for large breed puppies, made with lamb.",
    },
    ...sizes(["7 kg", "62.99", "VB-D-PUP-LMB-070"], ["12 kg", "94.99", "VB-D-PUP-LMB-120"]),
    metafields: [
      ...analysis({ protein: "27.0", fat: "14.0", fiber: "4.0", moisture: "10.0" }),
      metafield("ingredients", "list.metaobject_reference", JSON.stringify(ingredientIds.slice(0, 3))),
      metafield("kcal_per_kg", "number_integer", "3650"),
      metafield("species", "single_line_text_field", "Dog"),
      metafield("life_stage", "single_line_text_field", "Puppy"),
      metafield("food_type", "single_line_text_field", "Dry"),
      metafield("main_protein", "single_line_text_field", "Lamb"),
    ],
    files: [image("Large Breed Puppy Lamb Recipe, 7 kg bag"), image("")],
  },
];

for (const { handle, files, ...product } of PRODUCTS) {
  const uploaded = [];
  for (const [index, { alt }] of files.entries()) {
    const originalSource = await uploadCopy(`${handle}-${index + 1}.${imageExtension}`);
    uploaded.push({ originalSource, alt, contentType: "IMAGE" });
  }
  const input = {
    ...product,
    handle,
    files: uploaded,
    status: "DRAFT",
    vendor: "Vicubites",
    tags: [TAG],
  };
  const { productSet } = gql("seed-draft-product.graphql", { identifier: { handle }, input });
  if (productSet.userErrors.length > 0) {
    throw new Error(`${handle}: ${JSON.stringify(productSet.userErrors)}`);
  }
  console.log(`= ${productSet.product.status} ${handle}`);
}
console.log(`Done: ${PRODUCTS.length} draft products tagged "${TAG}".`);
