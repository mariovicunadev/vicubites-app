import { isBulkStatus, isExpired, isTerminal, type BulkStatus } from "./status";

/** The subset of a `BulkJob` row the exports page needs. */
export interface BulkJobRow {
  id: string;
  kind: string;
  status: string;
  errorCode: string | null;
  objectCount: number;
  rootObjectCount: number;
  url: string | null;
  partialDataUrl: string | null;
  urlExpiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
}

export type BadgeTone = "info" | "success" | "critical" | "neutral" | "warning";

export interface BulkJobView {
  id: string;
  kind: string;
  status: string;
  tone: BadgeTone;
  running: boolean;
  errorCode: string | null;
  objects: number;
  roots: number;
  createdAt: string;
  completedAt: string | null;
  download: "ready" | "partial" | "expired" | "none";
}

const TONES: Record<BulkStatus, BadgeTone> = {
  CREATED: "info",
  RUNNING: "info",
  CANCELING: "warning",
  COMPLETED: "success",
  FAILED: "critical",
  CANCELED: "neutral",
  EXPIRED: "critical",
};

const dateFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDate(date: Date): string {
  return `${dateFormat.format(date)} UTC`;
}

/**
 * Serializable, UI-ready view of a job. Dates are formatted on the server
 * in UTC so server and client render the same text.
 */
export function toJobView(job: BulkJobRow, now = new Date()): BulkJobView {
  const status: BulkStatus | null = isBulkStatus(job.status) ? job.status : null;
  const expired = isExpired(job.urlExpiresAt, now);

  let download: BulkJobView["download"] = "none";
  if (status === "COMPLETED") {
    download = expired ? "expired" : "ready";
  } else if (status === "FAILED" && job.partialDataUrl) {
    download = expired ? "expired" : "partial";
  }

  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    tone: status ? TONES[status] : "neutral",
    running: status ? !isTerminal(status) : false,
    errorCode: job.errorCode,
    objects: job.objectCount,
    roots: job.rootObjectCount,
    createdAt: formatDate(job.createdAt),
    completedAt: job.completedAt ? formatDate(job.completedAt) : null,
    download,
  };
}
