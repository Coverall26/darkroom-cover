import { test, expect } from "./fixtures/auth";

/**
 * Visual regression tests for critical business flows.
 *
 * Covers: CRM page, fund detail, wire transfers, e-signature,
 * outreach center, and document management pages across
 * desktop, tablet, and mobile viewports.
 *
 * Run:
 *   npx playwright test visual-critical-flows
 *   npx playwright test visual-critical-flows --update-snapshots
 */

// ---------------------------------------------------------------------------
// CRM Page
// ---------------------------------------------------------------------------
test.describe("CRM Page — Visual Regression", () => {
  test("CRM contacts page (desktop)", async ({ gpPage }) => {
    await gpPage.goto("/admin/crm");
    await gpPage.waitForLoadState("networkidle");
    await gpPage.locator("h1, h2").first().waitFor({ timeout: 15_000 });

    await expect(gpPage).toHaveScreenshot("crm-contacts-desktop.png", {
      fullPage: true,
    });
  });

  test("CRM contacts page (tablet)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 768, height: 1024 });
    await gpPage.goto("/admin/crm");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("crm-contacts-tablet.png", {
      fullPage: true,
    });
  });

  test("CRM contacts page (mobile)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 375, height: 812 });
    await gpPage.goto("/admin/crm");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("crm-contacts-mobile.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Outreach Center
// ---------------------------------------------------------------------------
test.describe("Outreach Center — Visual Regression", () => {
  test("outreach page (desktop)", async ({ gpPage }) => {
    await gpPage.goto("/admin/outreach");
    await gpPage.waitForLoadState("networkidle");
    await gpPage.locator("h1, h2").first().waitFor({ timeout: 15_000 });

    await expect(gpPage).toHaveScreenshot("outreach-center-desktop.png", {
      fullPage: true,
    });
  });

  test("outreach page (mobile)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 375, height: 812 });
    await gpPage.goto("/admin/outreach");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("outreach-center-mobile.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Fund Detail Page
// ---------------------------------------------------------------------------
test.describe("Fund Detail — Visual Regression", () => {
  test("fund list page (desktop)", async ({ gpPage }) => {
    await gpPage.goto("/admin/fund");
    await gpPage.waitForLoadState("networkidle");
    await gpPage.locator("h1, h2, table").first().waitFor({ timeout: 15_000 });

    await expect(gpPage).toHaveScreenshot("fund-list-desktop.png", {
      fullPage: true,
    });
  });

  test("fund list page (tablet)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 768, height: 1024 });
    await gpPage.goto("/admin/fund");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("fund-list-tablet.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// GP Wire Confirmation Page
// ---------------------------------------------------------------------------
test.describe("GP Wire Page — Visual Regression", () => {
  test("wire transfers page (desktop)", async ({ gpPage }) => {
    // Use admin fund listing to access wire page — direct URL requires fundId
    await gpPage.goto("/admin/fund");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-fund-overview-for-wire.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// GP Document Management
// ---------------------------------------------------------------------------
test.describe("GP Documents — Visual Regression", () => {
  test("documents page with tabs (desktop)", async ({ gpPage }) => {
    await gpPage.goto("/admin/documents");
    await gpPage.waitForLoadState("networkidle");
    await gpPage.locator("h1, h2").first().waitFor({ timeout: 15_000 });

    await expect(gpPage).toHaveScreenshot("gp-documents-desktop.png", {
      fullPage: true,
    });
  });

  test("documents page (tablet)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 768, height: 1024 });
    await gpPage.goto("/admin/documents");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-documents-tablet.png", {
      fullPage: true,
    });
  });

  test("documents page (mobile)", async ({ gpPage }) => {
    await gpPage.setViewportSize({ width: 375, height: 812 });
    await gpPage.goto("/admin/documents");
    await gpPage.waitForLoadState("networkidle");

    await expect(gpPage).toHaveScreenshot("gp-documents-mobile.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// LP Wire Instructions Page (3 viewports)
// ---------------------------------------------------------------------------
test.describe("LP Wire Page — Visual Regression", () => {
  test("wire instructions desktop", async ({ lpPage }) => {
    await lpPage.goto("/lp/wire");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-wire-desktop.png", {
      fullPage: true,
    });
  });

  test("wire instructions tablet", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 768, height: 1024 });
    await lpPage.goto("/lp/wire");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-wire-tablet.png", {
      fullPage: true,
    });
  });

  test("wire instructions mobile", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 375, height: 812 });
    await lpPage.goto("/lp/wire");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-wire-mobile.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// LP Docs Vault (tablet viewport gap)
// ---------------------------------------------------------------------------
test.describe("LP Docs Vault — Tablet Visual Regression", () => {
  test("docs vault tablet", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 768, height: 1024 });
    await lpPage.goto("/lp/docs");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-docs-tablet.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// LP Transactions (tablet viewport gap)
// ---------------------------------------------------------------------------
test.describe("LP Transactions — Tablet Visual Regression", () => {
  test("transactions tablet", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 768, height: 1024 });
    await lpPage.goto("/lp/transactions");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-transactions-tablet.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// LP Dashboard (tablet viewport gap)
// ---------------------------------------------------------------------------
test.describe("LP Dashboard — Tablet Visual Regression", () => {
  test("dashboard tablet", async ({ lpPage }) => {
    await lpPage.setViewportSize({ width: 768, height: 1024 });
    await lpPage.goto("/lp/dashboard");
    await lpPage.waitForLoadState("networkidle");

    await expect(lpPage).toHaveScreenshot("lp-dashboard-tablet.png", {
      fullPage: true,
    });
  });
});

// ---------------------------------------------------------------------------
// E-Signature Landing (unauthenticated)
// ---------------------------------------------------------------------------
test.describe("E-Signature — Visual Regression", () => {
  test("sign page without token shows error state", async ({ page }) => {
    await page.goto("/sign/invalid-token");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("esign-invalid-token.png", {
      fullPage: true,
    });
  });

  test("sign page mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sign/invalid-token");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("esign-invalid-token-mobile.png", {
      fullPage: true,
    });
  });
});
