/** Where a due-soon forecast is delivered: Klaviyo (customer email) or Flow (internal automation). */
export type ReminderChannel = "KLAVIYO" | "FLOW";

export const REMINDER_CHANNELS: readonly ReminderChannel[] = ["KLAVIYO", "FLOW"];

/** The fields that identify one reminder: a customer, a species and a run-out date. */
export interface ReminderTarget {
  customerId: string;
  species: string;
  runOutOn: string;
}

export interface SentReminder extends ReminderTarget {
  channel: string;
}

export function reminderKey({ customerId, species, runOutOn }: ReminderTarget): string {
  return `${customerId}|${species}|${runOutOn}`;
}

/**
 * The targets a channel still has to deliver: a reminder counts as sent per
 * channel, so a Klaviyo outage never blocks Flow, and the reverse.
 */
export function pendingFor<T extends ReminderTarget>(
  channel: ReminderChannel,
  targets: readonly T[],
  sent: readonly SentReminder[],
): T[] {
  const done = new Set(sent.filter((r) => r.channel === channel).map(reminderKey));
  return targets.filter((target) => !done.has(reminderKey(target)));
}
