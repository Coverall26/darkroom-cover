import { test, expect } from "./fixtures/auth";

/**
 * Visual regression tests for GP admin sub-pages.
 *
 * Covers investor pipeline, fund detail, settings, approvals,
 * and other key GP management pages.
 *
 * Run:
 *   npx playwright test visual-gp-pages
 *   npx playwright test visual-gp-pages --update-snapshots
 */

test.describe("GP Investor Pipeline — Visual Regression", () => {
  test("investor list page", async ({ gpPage }) => {
    await gpPage.goto("/admin/investors");
    await gpPage.waitForLoadState("networkidle");
    // Wait for content to load
    await gpPage
      .locator("h1, h2, table, [data-testid='investor-list']")
      .first()
      .waitFor({ timeout: 15_000 });

    await expect(gpPage).toHaveScreenshot("gp-investors-list.png", {
      fullPage: true,
    });
  });

  test("manual investor entry wizard", async ({ gpPage }) => {
    await gpPage.goto("/admin/investors/new");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-manual-investor-entry.png", {
      fullPage: true,
    });
  });
});

test.describe("GP Approvals — Visual Regression", () => {
  test("approval queue page", async ({ gpPage }) => {
    await gpPage.goto("/admin/approvals");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-approvals-queue.png", {
      fullPage: true,
    });
  });
});

test.describe("GP Reports — Visual Regression", () => {
  test("reports page", async ({ gpPage }) => {
    await gpPage.goto("/admin/reports");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-reports.png", {
      fullPage: true,
    });
  });
});

test.describe("GP Settings — Visual Regression", () => {
  test("settings center page", async ({ gpPage }) => {
    await gpPage.goto("/admin/settings");
    await gpPage.waitForLoadState("networkidle");
    // Wait for settings to hydrate
    await gpPage
      .locator("h1, [data-testid='settings-center']")
      .first()
      .waitFor({ timeout: 15_000 });

    await expect(gpPage).toHaveScreenshot("gp-settings-center.png", {
      fullPage: true,
    });
  });
});

test.describe("GP Setup Wizard — Visual Regression", () => {
  test("setup wizard step 1", async ({ gpPage }) => {
    await gpPage.goto("/admin/setup");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-setup-wizard-step1.png", {
      fullPage: true,
    });
  });
});

test.describe("GP Audit Log — Visual Regression", () => {
  test("audit log page", async ({ gpPage }) => {
    await gpPage.goto("/admin/audit");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-audit-log.png", {
      fullPage: true,
    });
  });
});
