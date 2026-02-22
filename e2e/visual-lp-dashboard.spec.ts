import { test, expect } from "./fixtures/auth";
import { LPDashboardPage } from "./pages/lp-dashboard.page";

/**
 * Visual regression tests for the LP Dashboard.
 *
 * These tests require an authenticated LP session and capture
 * screenshots of the LP portal in various states.
 *
 * Run:
 *   npx playwright test visual-lp-dashboard
 *   npx playwright test visual-lp-dashboard --update-snapshots
 */

test.describe("LP Dashboard — Visual Regression", () => {
  test("dashboard full page renders correctly", async ({ lpPage }) => {
    const dashboard = new LPDashboardPage(lpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(lpPage).toHaveScreenshot("lp-dashboard-full.png", {
      fullPage: true,
    });
  });

  test("dashboard summary cards", async ({ lpPage }) => {
    const dashboard = new LPDashboardPage(lpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    const summaryArea = lpPage
      .locator('[data-testid="dashboard-summary"], .grid')
      .first();
    if ((await summaryArea.count()) > 0) {
      await expect(summaryArea).toHaveScreenshot("lp-dashboard-summary.png");
    }
  });

  test("dashboard status tracker", async ({ lpPage }) => {
    const dashboard = new LPDashboardPage(lpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    const tracker = lpPage
      .locator('[data-testid="status-tracker"], [aria-label*="progress"]')
      .first();
    if ((await tracker.count()) > 0) {
      await expect(tracker).toHaveScreenshot("lp-status-tracker.png");
    }
  });
});

test.describe("LP Dashboard — Mobile Visual Regression", () => {
  test("mobile full page (375px)", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 375, height: 812 });
    const dashboard = new LPDashboardPage(lpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(lpPage).toHaveScreenshot("lp-dashboard-mobile.png", {
      fullPage: true,
    });
  });

  test("mobile bottom tab bar visible", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 375, height: 812 });
    const dashboard = new LPDashboardPage(lpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    const tabBar = lpPage
      .locator('[data-testid="bottom-tab-bar"], nav.fixed.bottom-0')
      .first();
    if ((await tabBar.count()) > 0) {
      await expect(tabBar).toHaveScreenshot("lp-bottom-tab-bar.png");
    }
  });
});

test.describe("LP Portal Pages — Visual Regression", () => {
  test("documents vault page", async ({ lpPage }) => {
    await lpPage.goto("/lp/docs");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-docs-vault.png", {
      fullPage: true,
    });
  });

  test("transactions page", async ({ lpPage }) => {
    await lpPage.goto("/lp/transactions");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-transactions.png", {
      fullPage: true,
    });
  });

  test("wire instructions page", async ({ lpPage }) => {
    await lpPage.goto("/lp/wire");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-wire-instructions.png", {
      fullPage: true,
    });
  });
});
