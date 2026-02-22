import { test as base, expect, type Page } from "@playwright/test";

/**
 * Authentication fixtures for E2E tests.
 *
 * Provides pre-authenticated Page objects for GP and LP users
 * using the demo credentials from seed-bermuda.ts.
 *
 * Usage:
 *   import { test } from "../fixtures/auth";
 *   test("gp dashboard loads", async ({ gpPage }) => { ... });
 *   test("lp dashboard loads", async ({ lpPage }) => { ... });
 */

// Demo credentials from prisma/seed-bermuda.ts
const GP_EMAIL = "joe@bermudafranchisegroup.com";
const GP_PASSWORD = "FundRoom2026!";
const LP_EMAIL = "demo-investor@example.com";
const LP_PASSWORD = "Investor2026!";

async function loginWithCredentials(
  page: Page,
  email: string,
  password: string,
  loginPath: string,
) {
  await page.goto(loginPath);
  await page.waitForLoadState("networkidle");

  // Fill credentials form
  const emailInput = page.locator('input[name="email"], input[type="email"]');
  const passwordInput = page.locator(
    'input[name="password"], input[type="password"]',
  );

  if ((await emailInput.count()) > 0 && (await passwordInput.count()) > 0) {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.locator('button[type="submit"]').click();
    await page.waitForLoadState("networkidle");
  }
}

type AuthFixtures = {
  gpPage: Page;
  lpPage: Page;
  unauthenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  gpPage: async ({ page }, use) => {
    await loginWithCredentials(page, GP_EMAIL, GP_PASSWORD, "/admin/login");
    await use(page);
  },

  lpPage: async ({ page }, use) => {
    await loginWithCredentials(page, LP_EMAIL, LP_PASSWORD, "/lp/login");
    await use(page);
  },

  unauthenticatedPage: async ({ page }, use) => {
    await use(page);
  },
});

export { expect };
