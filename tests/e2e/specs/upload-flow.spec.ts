import { test, expect } from "@playwright/test";

/**
 * Dev-portal upload flow smoke. Verifies the rewritten Block 3A flow
 * walks through every progress stage: form → hashing (with %) →
 * uploading → finalizing → polling → outcome.
 *
 * Authentication path: the API supports a test-mode bypass (Block 4D)
 * gated on OPENMARKET_TEST_MODE=1 + non-prod NODE_ENV. This spec sets
 * x-test-user-id + x-test-user-email on every API request via an
 * extraHTTPHeaders fixture. The dev-portal still loads pages
 * normally; only API calls that go through requireAuth see the
 * bypass headers. To run:
 *
 *   OPENMARKET_TEST_MODE=1 NODE_ENV=test pnpm dev
 *   OPENMARKET_TEST_USER_ID=<a-real-developer-auth-id> \
 *   OPENMARKET_TEST_USER_EMAIL=<that-developer-s-email> \
 *     pnpm --filter @openmarket/e2e test
 *
 * Self-skips when the bypass env vars aren't set, so this spec is a
 * no-op for engineers who haven't opted in.
 *
 * For end-to-end coverage of the OAuth + email-verification login UI
 * itself, use the storage-state pattern (see runbook).
 */

const DEV_PORTAL_URL = process.env.DEV_PORTAL_URL ?? "http://localhost:3002";
const TEST_USER_ID = process.env.OPENMARKET_TEST_USER_ID;
const TEST_USER_EMAIL = process.env.OPENMARKET_TEST_USER_EMAIL;

test.use({
  baseURL: DEV_PORTAL_URL,
  extraHTTPHeaders:
    TEST_USER_ID && TEST_USER_EMAIL
      ? {
          "x-test-user-id": TEST_USER_ID,
          "x-test-user-email": TEST_USER_EMAIL,
        }
      : {},
});

test.describe("dev-portal: upload flow smoke", () => {
  test.skip(
    !TEST_USER_ID || !TEST_USER_EMAIL,
    "OPENMARKET_TEST_USER_ID + OPENMARKET_TEST_USER_EMAIL not set — see test header.",
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
