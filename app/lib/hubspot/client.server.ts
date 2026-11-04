import { retryAfterSeconds, wait } from "../http/retry";

const BASE_URL = "https://api.hubapi.com";

/** HubSpot's date-based API version, part of every CRM path. */
export const HUBSPOT_API_VERSION = "2026-09";

/** Attempts per request on 429 (Free: 100 requests per 10 s) and 5xx. */
const MAX_ATTEMPTS = 3;

export class HubSpotError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HubSpotError";
  }
}

export interface HubSpotClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** The HubSpot static access token, from the server environment; null when HubSpot isn't connected. */
export function hubspotToken(): string | null {
  return process.env.HUBSPOT_ACCESS_TOKEN || null;
}

/**
 * One HubSpot API call. Retries 429 after `Retry-After` and 5xx after a short
 * pause; any other failure throws with HubSpot's message (which never
 * contains the token). Returns `null` for 404, so callers can tell "missing".
 */
export async function hubspotRequest<T>(
  token: string,
  method: "GET" | "POST" | "PUT",
  path: string,
  body?: unknown,
  { fetch: send = fetch, sleep = wait }: HubSpotClientOptions = {},
): Promise<T | null> {
  for (let attempt = 1; ; attempt++) {
    const response = await send(BASE_URL + path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.ok) {
      return response.status === 204 ? null : ((await response.json()) as T);
    }
    if (response.status === 404) return null;
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterSeconds(response.headers.get("Retry-After")) * 1000);
      continue;
    }
    throw new HubSpotError(response.status, await errorMessage(response));
  }
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: string };
    if (json.message) return `HubSpot ${response.status}: ${json.message}`;
  } catch {
    // Not JSON: fall through to the status.
  }
  return `HubSpot ${response.status}`;
}
