const DEFAULT_RETRY_SECONDS = 1;
const MAX_RETRY_SECONDS = 10;

/** Seconds to wait from a `Retry-After` header, capped; a default when it's missing or a date. */
export function retryAfterSeconds(header: string | null): number {
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_SECONDS;
  return Math.min(seconds, MAX_RETRY_SECONDS);
}

export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
