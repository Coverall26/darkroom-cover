import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for Login pages (GP admin login, LP login, main login).
 */
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly magicLinkButton: Locator;
  readonly googleButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator(
      'input[name="email"], input[type="email"]',
    );
    this.passwordInput = page.locator(
      'input[name="password"], input[type="password"]',
    );
    this.submitButton = page.locator('button[type="submit"]');
    this.magicLinkButton = page.locator("text=magic link, text=Magic Link");
    this.googleButton = page.locator("text=Google, text=Continue with Google");
    this.errorMessage = page.locator('[role="alert"], .text-red-500');
  }

  async gotoAdminLogin() {
    await this.page.goto("/admin/login");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoLPLogin() {
    await this.page.goto("/lp/login");
    await this.page.waitForLoadState("networkidle");
  }

  async gotoLogin() {
    await this.page.goto("/login");
    await this.page.waitForLoadState("networkidle");
  }
}
