import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: unit tests don't need the React Router plugin
// or the dev-server HMR settings.
export default defineConfig({
  test: {
    include: ["app/**/*.test.ts"],
    environment: "node",
  },
});
