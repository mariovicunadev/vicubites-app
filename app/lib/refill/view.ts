import { legacyId } from "../health/product";
import { daysLeft, isDueSoon } from "./forecast";

export type RefillTone = "critical" | "caution" | "neutral";

export interface RefillRow {
  customerId: string;
  /** Numeric ID for `shopify://admin/customers/{id}` links. */
  adminId: string;
  species: string;
  basis: string;
  runOutOn: string;
  daysLeft: number;
  /** "in 9 days", "today", "4 days ago". */
  due: string;
  tone: RefillTone;
  dueSoon: boolean;
}

const SPECIES_LABELS: Record<string, string> = { dog: "Dog", cat: "Cat" };
const BASIS_LABELS: Record<string, string> = {
  estimate: "Estimate (first order)",
  cadence: "Reorder cadence",
};

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function dueLabel(days: number): string {
  if (days === 0) return "today";
  return days > 0 ? `in ${plural(days, "day")}` : `${plural(-days, "day")} ago`;
}

/**
 * One table row per forecast. Customers show by ID only: the page needs no
 * name or email (protected customer data level 2), and the link opens the
 * customer in the admin for anyone allowed to see more.
 */
export function toRefillRow(
  forecast: { customerId: string; species: string; basis: string; runOutOn: string },
  today: string,
): RefillRow {
  const left = daysLeft(forecast, today);
  const dueSoon = isDueSoon(forecast, today);
  return {
    customerId: forecast.customerId,
    adminId: legacyId(forecast.customerId),
    species: SPECIES_LABELS[forecast.species] ?? forecast.species,
    basis: BASIS_LABELS[forecast.basis] ?? forecast.basis,
    runOutOn: forecast.runOutOn,
    daysLeft: left,
    due: dueLabel(left),
    tone: left < 0 ? "critical" : dueSoon ? "caution" : "neutral",
    dueSoon,
  };
}
