import type { ForecastBasis, Species } from "../refill/forecast";

/** Klaviyo API revision the request bodies follow. */
export const KLAVIYO_REVISION = "2026-10-15";

/** The metric a Klaviyo flow triggers on. */
export const REFILL_DUE_METRIC = "Refill Due";

export interface RefillDue {
  customerId: string;
  /** Read at send time and never stored. */
  email: string;
  species: Species;
  basis: ForecastBasis;
  daysOfFood: number;
  /** `YYYY-MM-DD`. */
  runOutOn: string;
  /** Days until run-out; negative when it already ran out. */
  daysLeft: number;
}

/** The body of `POST /api/events` (JSON:API). */
export interface KlaviyoEventBody {
  data: {
    type: "event";
    attributes: {
      properties: Record<string, string | number>;
      time: string;
      unique_id: string;
      metric: { data: { type: "metric"; attributes: { name: string } } };
      profile: { data: { type: "profile"; attributes: { email: string } } };
    };
  };
}

/**
 * One reminder per customer, species and run-out date: Klaviyo records only
 * the first event with a given `unique_id` for a profile and metric, so a
 * resend is harmless and a new purchase (new run-out date) is a new reminder.
 */
export function refillDueUniqueId(customerId: string, species: Species, runOutOn: string): string {
  const id = /(\d+)$/.exec(customerId)?.[1] ?? customerId;
  return `refill-due:${id}:${species}:${runOutOn}`;
}

export function refillDueEvent(reminder: RefillDue, now: Date): KlaviyoEventBody {
  return {
    data: {
      type: "event",
      attributes: {
        properties: {
          species: reminder.species,
          run_out_on: reminder.runOutOn,
          days_left: reminder.daysLeft,
          basis: reminder.basis,
          days_of_food: reminder.daysOfFood,
        },
        time: now.toISOString(),
        unique_id: refillDueUniqueId(reminder.customerId, reminder.species, reminder.runOutOn),
        metric: { data: { type: "metric", attributes: { name: REFILL_DUE_METRIC } } },
        profile: { data: { type: "profile", attributes: { email: reminder.email } } },
      },
    },
  };
}
