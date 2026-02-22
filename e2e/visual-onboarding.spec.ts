import { test, expect } from "@playwright/test";

/**
 * Visual regression tests for LP onboarding flow.
 *
 * Tests the public-facing LP onboarding wizard pages at various
 * steps. Uses unauthenticated pages (onboarding is accessible
 * via fund/team URL parameters).
 *
 * Run:
 *   npx playwright test visual-onboarding
 *   npx playwright test visual-onboarding --update-snapshots
 */

test.describe("LP Onboarding — Visual Regression", () => {
  // Note: Onboarding requires fundId/teamId params from seed data.
  // These tests verify the page layout renders without crashing.
  // Full functional E2E is covered in P1-D.

  test("onboarding page loads without crash", async ({ page }) => {
    // Navigate to onboarding — will show error or gate without valid params
    await page.goto("/lp/onboard");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("lp-onboard-no-params.png", {
      fullPage: true,
    });
  });

  test("onboarding page mobile view", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/lp/onboard");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("lp-onboard-mobile-no-params.png", {
      fullPage: true,
    });
  });
});

test.describe("Dataroom Public View — Visual Regression", () => {
  test("dataroom view page loads", async ({ page }) => {
    // The seed dataroom link slug
    await page.goto("/d/bermuda-club-fund");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("dataroom-public-view.png", {
      fullPage: true,
    });
  });

  test("dataroom view mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/d/bermuda-club-fund");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("dataroom-public-view-mobile.png", {
      fullPage: true,
    });
  });
});
