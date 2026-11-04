import { KLAVIYO_REVISION, type KlaviyoEventBody } from "./event";

const EVENTS_URL = "https://a.klaviyo.com/api/events";

/** Attempts per event when Klaviyo answers 429 (rate limited). */
const MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_SECONDS = 1;
const MAX_RETRY_SECONDS = 10;

export class KlaviyoError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "KlaviyoError";
  }
}

export interface KlaviyoClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Seconds to wait from a `Retry-After` header, capped; a default when it's missing or a date. */
export function retryAfterSeconds(header: string | null): number {
  const seconds = Number(header);
  if (!header || !Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_SECONDS;
  return Math.min(seconds, MAX_RETRY_SECONDS);
}

/**
 * Sends one event. Klaviyo answers 202 once the event is accepted for
 * processing; 429 is retried after `Retry-After`; anything else throws with
 * Klaviyo's error detail (which never contains the private key).
 */
export async function createKlaviyoEvent(
  apiKey: string,
  body: KlaviyoEventBody,
  { fetch: send = fetch, sleep = wait }: KlaviyoClientOptions = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const response = await send(EVENTS_URL, {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${apiKey}`,
        revision: KLAVIYO_REVISION,
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
      },
      body: JSON.stringify(body),
    });
    if (response.ok) return;
    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterSeconds(response.headers.get("Retry-After")) * 1000);
      continue;
    }
    throw new KlaviyoError(response.status, await errorDetail(response));
  }
}

async function errorDetail(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { errors?: { detail?: string }[] };
    const detail = json.errors?.[0]?.detail;
    if (detail) return `Klaviyo ${response.status}: ${detail}`;
  } catch {
    // Not JSON: fall through to the status.
  }
  return `Klaviyo ${response.status}`;
}
