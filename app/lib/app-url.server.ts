type Env = Record<string, string | undefined>;

/**
 * Public origin of the app, without a trailing slash.
 *
 * `SHOPIFY_APP_URL` wins: the Shopify CLI sets it to the tunnel during development, and
 * production sets it explicitly. On Vercel, the production domain is the fallback.
 */
export function getAppUrl(env: Env = process.env): string {
  const explicit = env.SHOPIFY_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "";
}
