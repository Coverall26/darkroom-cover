import { test, expect } from "./fixtures/auth";
import { AdminDashboardPage } from "./pages/admin-dashboard.page";

/**
 * Visual regression tests for the GP Admin Dashboard.
 *
 * These tests require an authenticated GP session and capture
 * screenshots of the dashboard in various states.
 *
 * Run:
 *   npx playwright test visual-gp-dashboard
 *   npx playwright test visual-gp-dashboard --update-snapshots
 */

test.describe("GP Dashboard — Visual Regression", () => {
  test("dashboard full page renders correctly", async ({ gpPage }) => {
    const dashboard = new AdminDashboardPage(gpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(gpPage).toHaveScreenshot("gp-dashboard-full.png", {
      fullPage: true,
    });
  });

  test("dashboard header with search and notifications", async ({
    gpPage,
  }) => {
    const dashboard = new AdminDashboardPage(gpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Screenshot just the header area
    const header = gpPage.locator("header").first();
    if ((await header.count()) > 0) {
      await expect(header).toHaveScreenshot("gp-dashboard-header.png");
    }
  });

  test("dashboard sidebar navigation", async ({ gpPage }) => {
    const dashboard = new AdminDashboardPage(gpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Screenshot the sidebar
    const sidebar = gpPage
      .locator('nav, aside, [data-testid="admin-sidebar"]')
      .first();
    if ((await sidebar.count()) > 0) {
      await expect(sidebar).toHaveScreenshot("gp-dashboard-sidebar.png");
    }
  });

  test("dashboard stats cards", async ({ gpPage }) => {
    const dashboard = new AdminDashboardPage(gpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    // Screenshot the stats/metrics area
    const statsArea = gpPage
      .locator(
        '[data-testid="stats-grid"], .grid:has([data-testid="stat-card"])',
      )
      .first();
    if ((await statsArea.count()) > 0) {
      await expect(statsArea).toHaveScreenshot("gp-dashboard-stats.png");
    }
  });
});

test.describe("GP Dashboard — Responsive", () => {
  test("tablet view (768px)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 768, height: 1024 });
    const dashboard = new AdminDashboardPage(gpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(gpPage).toHaveScreenshot("gp-dashboard-tablet.png", {
      fullPage: true,
    });
  });

  test("mobile view (375px)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 375, height: 812 });
    const dashboard = new AdminDashboardPage(gpPage);
    await dashboard.goto();
    await dashboard.waitForDashboardLoad();

    await expect(gpPage).toHaveScreenshot("gp-dashboard-mobile.png", {
      fullPage: true,
    });
  });
});
