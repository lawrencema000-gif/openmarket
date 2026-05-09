import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for OpenMarket E2E smoke tests.
 *
 * Tests assume the local dev stack is up:
 *   - market-web on :3000
 *   - dev-portal on :3002
 *   - admin     on :3003
 *   - api       on :3001
 *   - infra     (Postgres / Redis / MinIO / Meilisearch) via Docker Compose
 *
 * Bring it all up with `pnpm dev` from the repo root + `docker compose
 * up -d` in `infrastructure/docker/`. Then `pnpm --filter @openmarket/e2e test`.
 *
 * In CI, a future Block 4 task will boot the same stack and run these
 * tests as a gating check. For now they're a developer-facing smoke;
 * each test self-skips if the required URL doesn't respond.
 */
export default defineConfig({
  testDir: "./specs",
  fullyParallel: false, // smokes hit shared resources; serial avoids flake
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.WEB_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
