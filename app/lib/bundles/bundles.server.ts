import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";

import type { BundlesOverviewQuery } from "../../types/admin.generated";
import { assertNoUserErrors } from "../admin/errors";
import { adminGraphql } from "../admin/graphql.server";
import {
  STARTER_KIT,
  STARTER_KIT_CONFIG_KEY,
  STARTER_KIT_FUNCTION_HANDLE,
  STARTER_KIT_PICKER_KEY,
  buildStarterKit,
  isOutdated,
  type StarterKitBuild,
} from "./starter-kit";

type AdminGraphql = AdminApiContext["graphql"];

/**
 * Everything the Bundles section needs in one read: this app's functions,
 * its cart transform (a store has at most one per app), and the products
 * the kit is built from.
 */
const BUNDLES_OVERVIEW = `#graphql
  query bundlesOverview($kitHandle: String!, $recipeQuery: String!, $treatsHandle: String!) {
    shopifyFunctions(first: 25) {
      nodes {
        id
        handle
      }
    }
    cartTransforms(first: 5) {
      nodes {
        id
        functionId
        config: metafield(namespace: "$app", key: "starter-kit-config") {
          jsonValue
        }
      }
    }
    shop {
      id
      features {
        bundles {
          eligibleForBundles
        }
      }
    }
    kit: productByIdentifier(identifier: { handle: $kitHandle }) {
      legacyResourceId
      status
      variants(first: 5) {
        nodes {
          id
          requiresComponents
        }
      }
    }
    recipes: products(first: 25, query: $recipeQuery) {
      nodes {
        handle
        title
        variants(first: 10) {
          nodes {
            id
            title
            price
            bagGrams: metafield(namespace: "custom", key: "bag_grams") {
              value
            }
          }
        }
      }
    }
    treats: productByIdentifier(identifier: { handle: $treatsHandle }) {
      status
      variants(first: 10) {
        nodes {
          id
          title
          price
        }
      }
    }
  }
`;

const STARTER_KIT_TRANSFORM_CREATE = `#graphql
  mutation starterKitTransformCreate($functionHandle: String!, $metafields: [MetafieldInput!]!) {
    cartTransformCreate(functionHandle: $functionHandle, blockOnFailure: false, metafields: $metafields) {
      cartTransform {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const STARTER_KIT_CONFIG_SET = `#graphql
  mutation starterKitConfigSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

export interface BundlesView {
  eligibleForBundles: boolean;
  /** `false` when the function isn't deployed to this store yet. */
  functionReady: boolean;
  /** This app's cart transform; `null` until created. */
  transformId: string | null;
  /** Saved configuration differs from the store's products (or is missing). */
  outdated: boolean;
  build: StarterKitBuild;
}

interface BundlesState {
  view: BundlesView;
  shopId: string;
}

async function readBundles(graphql: AdminGraphql): Promise<BundlesState> {
  const data: BundlesOverviewQuery = await adminGraphql(graphql, BUNDLES_OVERVIEW, {
    variables: {
      kitHandle: STARTER_KIT.kitHandle,
      recipeQuery: STARTER_KIT.recipeQuery,
      treatsHandle: STARTER_KIT.treatsHandle,
    },
  });

  const functionId = data.shopifyFunctions.nodes.find((fn) => fn.handle === STARTER_KIT_FUNCTION_HANDLE)?.id ?? null;
  const transform = data.cartTransforms.nodes.find((node) => node.functionId === functionId) ?? null;

  const build = buildStarterKit({
    kit: data.kit
      ? {
          // UnsignedInt64 scalar: typed loosely by codegen, a string on the wire.
          legacyResourceId: String(data.kit.legacyResourceId),
          status: data.kit.status,
          variants: data.kit.variants.nodes,
        }
      : null,
    recipes: data.recipes.nodes.map((product) => ({
      ...product,
      variants: product.variants.nodes.map(({ bagGrams, ...variant }) => ({ ...variant, bagGrams: bagGrams?.value ?? null })),
    })),
    treats: data.treats ? { status: data.treats.status, variants: data.treats.variants.nodes } : null,
  });

  return {
    shopId: data.shop.id,
    view: {
      eligibleForBundles: data.shop.features.bundles.eligibleForBundles,
      functionReady: functionId !== null,
      transformId: transform?.id ?? null,
      outdated: !build.ok || !transform || isOutdated(transform.config?.jsonValue, build.functionConfig),
      build,
    },
  };
}

export async function loadBundles(graphql: AdminGraphql): Promise<BundlesView> {
  return (await readBundles(graphql)).view;
}

function jsonMetafield(key: string, value: object) {
  return { namespace: "$app", key, type: "json", value: JSON.stringify(value) };
}

/**
 * Builds the configuration from the store's products, then creates the cart
 * transform (failing open: `blockOnFailure: false`) or rewrites its
 * configuration, and writes the picker's options to the shop.
 *
 * Returns the problems that stop the build, or `null` once saved.
 */
export async function saveStarterKit(graphql: AdminGraphql): Promise<string[] | null> {
  const { view, shopId } = await readBundles(graphql);
  if (!view.functionReady) return ["The starter kit function isn't deployed to this store yet."];
  if (!view.build.ok) return view.build.problems;
  const { functionConfig, picker } = view.build;

  const metafields = [{ ownerId: shopId, ...jsonMetafield(STARTER_KIT_PICKER_KEY, picker) }];
  if (view.transformId) {
    metafields.push({ ownerId: view.transformId, ...jsonMetafield(STARTER_KIT_CONFIG_KEY, functionConfig) });
  } else {
    const created = await adminGraphql(graphql, STARTER_KIT_TRANSFORM_CREATE, {
      variables: {
        functionHandle: STARTER_KIT_FUNCTION_HANDLE,
        metafields: [jsonMetafield(STARTER_KIT_CONFIG_KEY, functionConfig)],
      },
    });
    assertNoUserErrors("starterKitTransformCreate", created.cartTransformCreate?.userErrors);
  }

  const saved = await adminGraphql(graphql, STARTER_KIT_CONFIG_SET, { variables: { metafields } });
  assertNoUserErrors("starterKitConfigSet", saved.metafieldsSet?.userErrors);
  return null;
}
