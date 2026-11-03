import type { BulkNode } from "../bulk/jsonl";
import { bagGrams, bagKcal, speciesFrom, type Purchase, type Species } from "./forecast";

/** The bag size option of dry food products. */
export const SIZE_OPTION = "Size";

/** Order fields shared by the bulk load and the single-order query. */
const ORDER_FIELDS = `
  id
  processedAt
  customer { id }
  purchasingEntity { __typename }`;

const LINE_ITEM_FIELDS = `
  quantity
  variant {
    selectedOptions { name value }
    product {
      species: metafield(namespace: "custom", key: "species") { value }
      kcalPerKg: metafield(namespace: "custom", key: "kcal_per_kg") { value }
    }
  }`;

/**
 * Bulk query over every order the app can read (`read_orders` covers the
 * last 60 days). Line items come back as child rows of their order.
 */
export const REFILL_ORDERS_BULK_QUERY = `{
  orders {
    edges {
      node {${ORDER_FIELDS}
        lineItems {
          edges {
            node {
              id${LINE_ITEM_FIELDS}
            }
          }
        }
      }
    }
  }
}`;

export interface OrderLine {
  quantity: number;
  /** Variant option values keyed by option name. */
  options: Readonly<Record<string, string>>;
  species: string | null;
  kcalPerKg: string | null;
}

/** An order reduced to what the forecast reads. */
export interface OrderData {
  id: string;
  processedAt: string;
  customerId: string | null;
  /** B2B orders restock a business, not a pet. */
  isCompanyPurchase: boolean;
  lines: readonly OrderLine[];
}

interface LineFields {
  quantity?: unknown;
  variant?: {
    selectedOptions?: { name: string; value: string }[];
    product?: { species?: { value: string } | null; kcalPerKg?: { value: string } | null } | null;
  } | null;
}

interface OrderFields {
  id?: unknown;
  processedAt?: unknown;
  customer?: { id: string } | null;
  purchasingEntity?: { __typename?: string } | null;
}

function lineFrom(fields: LineFields): OrderLine {
  const options: Record<string, string> = {};
  for (const { name, value } of fields.variant?.selectedOptions ?? []) options[name] = value;
  return {
    quantity: typeof fields.quantity === "number" ? fields.quantity : 0,
    options,
    species: fields.variant?.product?.species?.value ?? null,
    kcalPerKg: fields.variant?.product?.kcalPerKg?.value ?? null,
  };
}

function orderFrom(fields: OrderFields, lines: LineFields[]): OrderData {
  return {
    id: String(fields.id ?? ""),
    processedAt: String(fields.processedAt ?? ""),
    customerId: fields.customer?.id ?? null,
    isCompanyPurchase: fields.purchasingEntity?.__typename === "PurchasingCompany",
    lines: lines.map(lineFrom),
  };
}

/** From a bulk result node: line items are its `LineItem` children. */
export function orderFromBulkNode(node: BulkNode): OrderData {
  const lines = (node.children.LineItem ?? []).map((child) => child.record as LineFields);
  return orderFrom(node.record as OrderFields, lines);
}

/** From the single-order query, where line items are a connection's nodes. */
export function orderFromQuery(order: OrderFields & { lineItems: { nodes: LineFields[] } }): OrderData {
  return orderFrom(order, order.lineItems.nodes);
}

/**
 * The dry food in an order, one purchase per species. Lines without a bag
 * size, species or calories (wet food, treats, incomplete products) are
 * skipped, and so are B2B orders and orders without a customer.
 */
export function purchasesFromOrder(order: OrderData): Purchase[] {
  if (!order.customerId || order.isCompanyPurchase) return [];
  const kcalBySpecies = new Map<Species, number>();
  for (const line of order.lines) {
    const size = line.options[SIZE_OPTION];
    const grams = size ? bagGrams(size) : null;
    const species = speciesFrom(line.species);
    const kcalPerKg = Number(line.kcalPerKg);
    if (!grams || !species || !Number.isFinite(kcalPerKg) || kcalPerKg <= 0 || line.quantity <= 0) continue;
    kcalBySpecies.set(species, (kcalBySpecies.get(species) ?? 0) + bagKcal(grams, kcalPerKg, line.quantity));
  }
  return [...kcalBySpecies].map(([species, kcal]) => ({
    orderId: order.id,
    processedAt: order.processedAt,
    species,
    kcal,
  }));
}
