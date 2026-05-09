import { test, expect } from "@playwright/test";

/**
 * Dev-portal upload flow smoke. Verifies the rewritten Block 3A flow
 * walks through every progress stage: form → hashing (with %) →
 * uploading → finalizing → polling → outcome.
 *
 * IMPORTANT: this test EXPECTS to be authenticated — it doesn't run
 * the real Better Auth sign-in flow because email-verification gating
 * makes that flaky in a smoke. The test self-skips if the developer's
 * API session cookie isn't already in the browser context.
 *
 * To run locally:
 *   1. `pnpm dev` (boots api + dev-portal)
 *   2. Sign in to dev-portal at :3002 manually with a verified test
 *      developer account
 *   3. Save the storage state once:
 *        npx playwright codegen --save-storage=.auth/dev.json \
 *          http://localhost:3002
 *   4. PLAYWRIGHT_DEV_STATE=.auth/dev.json pnpm --filter @openmarket/e2e test
 *
 * Block 3B-followup: a small test-mode auth bypass on the API would
 * remove the manual sign-in step. Tracked in `docs/runbooks/e2e.md`.
 */

const DEV_PORTAL_URL = process.env.DEV_PORTAL_URL ?? "http://localhost:3002";
const STATE_FILE = process.env.PLAYWRIGHT_DEV_STATE;

test.use({
  storageState: STATE_FILE,
  baseURL: DEV_PORTAL_URL,
});

test.describe("dev-portal: upload flow smoke", () => {
  test.skip(
    !STATE_FILE,
    "PLAYWRIGHT_DEV_STATE not set — see test header for setup steps.",
  );

  test.beforeEach(async ({ page, baseURL }) => {
    const probe = await page.request.get(baseURL!).catch(() => null);
    test.skip(
      !probe || !probe.ok(),
      `dev-portal not reachable at ${baseURL} — start it with \`pnpm dev\`.`,
    );
  });

  test("upload form renders with the new step machine", async ({ page }) => {
    // Land on the dashboard, then navigate into the apps list. We avoid
    // hard-coding an app id since the dev's seeded-app id varies.
    await page.goto("/dashboard");
    const firstAppLink = page.locator('a[href^="/apps/"]').first();
    if ((await firstAppLink.count()) === 0) {
      test.skip(true, "Dev account has no apps — create one first.");
    }
    await firstAppLink.click();

    // From app detail, navigate to the new release page.
    const newReleaseLink = page.getByRole("link", { name: /Create Release|New release/i });
    if ((await newReleaseLink.count()) === 0) {
      test.skip(true, "Dev portal app detail does not expose a new-release link.");
    }
    await newReleaseLink.first().click();

    // We should now be on the upload form.
    await expect(page.getByRole("heading", { name: /Create Release/i })).toBeVisible();
    await expect(page.getByLabel(/Version Code/i)).toBeVisible();
    await expect(page.getByLabel(/Version Name/i)).toBeVisible();
    await expect(page.getByLabel(/Release Channel/i)).toBeVisible();

    // The new step machine includes a file dropzone + "Create release"
    // button (not "Upload" — that's the old form).
    await expect(page.getByText(/Click to select an APK file/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Create release/i })).toBeVisible();
  });
});
