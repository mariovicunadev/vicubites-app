import type {
  BulkOperationErrorCode,
  BulkOperationStatus,
} from "../../types/admin.types";

/**
 * String unions derived from the generated enums, so values coming from the
 * database or a webhook payload can be compared without casting.
 */
export type BulkStatus = `${BulkOperationStatus}`;
export type BulkErrorCode = `${BulkOperationErrorCode}`;

const TERMINAL_STATUSES: ReadonlySet<BulkStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "EXPIRED",
]);

const STATUSES: ReadonlySet<string> = new Set<BulkStatus>([
  "CREATED",
  "RUNNING",
  "CANCELING",
  ...TERMINAL_STATUSES,
]);

const ERROR_CODES: ReadonlySet<string> = new Set<BulkErrorCode>([
  "ACCESS_DENIED",
  "INTERNAL_SERVER_ERROR",
  "TIMEOUT",
]);

/** Result URLs stay downloadable for seven days after completion. */
export const RESULT_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function isTerminal(status: BulkStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isBulkStatus(value: string): value is BulkStatus {
  return STATUSES.has(value);
}

/**
 * The `bulk_operations/finish` webhook sends lowercase values
 * (`"completed"`, `"access_denied"`) while GraphQL uses the enum names.
 */
export function parseWebhookStatus(value: string): BulkStatus | null {
  const upper = value.toUpperCase();
  return isBulkStatus(upper) ? upper : null;
}

export function parseWebhookErrorCode(
  value: string | null | undefined,
): BulkErrorCode | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return ERROR_CODES.has(upper) ? (upper as BulkErrorCode) : null;
}

/**
 * A job needs GraphQL while it runs, and also when it finished without its
 * details: the webhook payload has the status but no counts or URL.
 */
export function needsRefresh(job: { status: string; url: string | null }): boolean {
  if (!isBulkStatus(job.status) || !isTerminal(job.status)) return true;
  return job.status === "COMPLETED" && !job.url;
}

export function resultUrlExpiresAt(completedAt: Date): Date {
  return new Date(completedAt.getTime() + RESULT_URL_TTL_MS);
}

export function isExpired(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}
