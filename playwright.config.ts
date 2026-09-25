import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests run against the real Next.js dev server and a seeded
 * PostgreSQL database (DATABASE_URL in .env). Run `npm run db:reset && npm run db:seed`
 * once before executing these tests so the demo fixtures exist.
 */
const PORT = process.env.PORT ?? "3000";
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Next.js dev compiles routes on demand, so give the server and first
    // page loads generous timeouts.
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});