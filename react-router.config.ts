import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

// Server-rendered app. Vercel sets VERCEL=1 during its builds: there the preset maps routes to
// Vercel Functions (split server bundles). Elsewhere the build stays a single Node server bundle
// (build/server/index.js) for `npm start` and the Dockerfile.
export default {
  ssr: true,
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;
