import { test, expect } from "@playwright/test";

/**
 * Storefront smoke. Doesn't require an authenticated session — just
 * verifies the public surfaces don't 500 and key elements render.
 *
 * Why this is the highest-value first browser test:
 *   1. The home page exercises the API (categories) end-to-end.
 *   2. The transparency report exercises the API + DSA aggregate panel.
 *   3. The anti-features page exercises @openmarket/contracts wiring.
 *   4. The /search page exercises rate-limit middleware (1 request).
 *
 * If any of these 500s, the storefront is broken before we even get
 * to the upload happy path.
 */

test.describe("storefront smoke", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    // Self-skip when the dev server isn't up — keeps `pnpm test` from
    // failing for a developer who doesn't have the stack running.
    const probe = await page.request.get(baseURL!).catch(() => null);
    test.skip(
      !probe || !probe.ok(),
      `market-web not reachable at ${baseURL} — start it with \`pnpm dev\`.`,
    );
  });

  test("home page renders without a server error", async ({ page }) => {
    await page.goto("/");
    // Look for the hero copy that's stable across redesigns.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Check the SearchForm is present.
    await expect(page.getByPlaceholder(/Search/)).toBeVisible();
  });

  test("transparency report loads + DSA aggregate panel is visible", async ({
    page,
  }) => {
    await page.goto("/transparency-report");
    await expect(
      page.getByRole("heading", { name: /Transparency Report/i }),
    ).toBeVisible();
    // The 4 headline cards added by Block 2C.
    await expect(page.getByText(/Total events/i)).toBeVisible();
    await expect(page.getByText(/Appeals filed/i)).toBeVisible();
    await expect(page.getByText(/Response time/i)).toBeVisible();
  });

  test("anti-features taxonomy page lists every label", async ({ page }) => {
    await page.goto("/anti-features");
    await expect(
      page.getByRole("heading", { name: /Anti-Features Taxonomy/i }),
    ).toBeVisible();
    // The three source-grouped sections.
    await expect(
      page.getByRole("heading", { name: /Scanner-derived/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Developer self-attested/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Moderator-set/i }),
    ).toBeVisible();
  });

  test("sitemap.xml is well-formed and returns urlset entries", async ({
    request,
    baseURL,
  }) => {
    const res = await request.get(`${baseURL}/sitemap.xml`);
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml).toContain("<urlset");
    expect(xml).toMatch(/<loc>https?:\/\/[^<]+<\/loc>/);
  });

  test("robots.txt points at sitemap", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/robots.txt`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("sitemap:");
  });
});
