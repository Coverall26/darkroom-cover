import { test, expect } from "@playwright/test";
import { LoginPage } from "./pages/login.page";

/**
 * Visual regression tests for login and authentication pages.
 *
 * These tests capture screenshots of login pages in various states
 * and compare them against baseline snapshots to detect unintended
 * visual changes.
 *
 * Run:
 *   npx playwright test visual-login
 *   npx playwright test visual-login --update-snapshots  # regenerate baselines
 */

test.describe("Login Pages — Visual Regression", () => {
  test("admin login page renders correctly", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.gotoAdminLogin();

    await expect(page).toHaveScreenshot("admin-login-default.png", {
      fullPage: true,
    });
  });

  test("admin login page with password mode", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.gotoAdminLogin();

    // Toggle to password mode if available
    const passwordToggle = page.locator(
      "text=password, text=Use password, text=Sign in with password",
    );
    if ((await passwordToggle.count()) > 0) {
      await passwordToggle.first().click();
      await page.waitForTimeout(300); // animation settle
    }

    await expect(page).toHaveScreenshot("admin-login-password-mode.png", {
      fullPage: true,
    });
  });

  test("LP login page renders correctly", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.gotoLPLogin();

    await expect(page).toHaveScreenshot("lp-login-default.png", {
      fullPage: true,
    });
  });

  test("login page with error state", async ({ page }) => {
    const loginPage = new LoginPage(page);
    // Navigate with error query parameter
    await page.goto("/admin/login?error=Verification");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("admin-login-error-state.png", {
      fullPage: true,
    });
  });

  test("signup page renders correctly", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle");

    await expect(page).toHaveScreenshot("signup-default.png", {
      fullPage: true,
    });
  });
});

test.describe("Login Pages — Mobile Visual Regression", () => {
  test.use({ viewport: { width: 375, height: 812 } }); // iPhone SE

  test("admin login mobile renders correctly", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.gotoAdminLogin();

    await expect(page).toHaveScreenshot("admin-login-mobile.png", {
      fullPage: true,
    });
  });

  test("LP login mobile renders correctly", async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.gotoLPLogin();

    await expect(page).toHaveScreenshot("lp-login-mobile.png", {
      fullPage: true,
    });
  });
});
