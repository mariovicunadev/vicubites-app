import type { ForecastBasis, Species } from "../refill/forecast";

/** The handle in `extensions/refill-due-trigger/shopify.extension.toml`. */
export const REFILL_DUE_TRIGGER = "refill-due";

export interface RefillDueTrigger {
  /** Customer GID, as stored by Refill Radar. */
  customerId: string;
  species: Species;
  /** `YYYY-MM-DD`. */
  runOutOn: string;
  /** Days until run-out; negative when it already ran out. */
  daysLeft: number;
  basis: ForecastBasis;
}

/**
 * The `flowTriggerReceive` payload. Keys match the extension's field keys;
 * the customer reference is `customer_id` with the numeric customer ID.
 * Only forecast data and the customer reference: Flow reads anything else
 * about the customer itself, with the merchant's permissions.
 */
export interface RefillDuePayload {
  customer_id: number;
  Species: Species;
  "Run out date": string;
  "Days left": number;
  "Forecast basis": ForecastBasis;
}

/** Numeric ID from a GID such as `gid://shopify/Customer/123`. */
export function numericId(gid: string): number {
  const match = /(\d+)$/.exec(gid);
  if (!match) throw new Error(`Not a Shopify ID: ${gid}`);
  return Number(match[1]);
}

export function refillDuePayload(trigger: RefillDueTrigger): RefillDuePayload {
  return {
    customer_id: numericId(trigger.customerId),
    Species: trigger.species,
    "Run out date": trigger.runOutOn,
    "Days left": trigger.daysLeft,
    "Forecast basis": trigger.basis,
  };
}
