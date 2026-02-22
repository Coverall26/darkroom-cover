import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the LP Dashboard.
 * Encapsulates selectors and actions for visual regression tests.
 */
export class LPDashboardPage {
  readonly page: Page;
  readonly header: Locator;
  readonly statusTracker: Locator;
  readonly summaryCards: Locator;
  readonly fundCards: Locator;
  readonly capitalCallsSection: Locator;
  readonly documentsSection: Locator;
  readonly transactionsSection: Locator;
  readonly bottomTabBar: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.locator('[data-testid="lp-header"]');
    this.statusTracker = page.locator('[data-testid="status-tracker"]');
    this.summaryCards = page.locator('[data-testid="dashboard-summary"]');
    this.fundCards = page.locator('[data-testid="fund-cards"]');
    this.capitalCallsSection = page.locator(
      '[data-testid="capital-calls-section"]',
    );
    this.documentsSection = page.locator(
      '[data-testid="documents-section"]',
    );
    this.transactionsSection = page.locator(
      '[data-testid="transactions-section"]',
    );
    this.bottomTabBar = page.locator('[data-testid="bottom-tab-bar"]');
  }

  async goto() {
    await this.page.goto("/lp/dashboard");
    await this.page.waitForLoadState("networkidle");
  }

  async waitForDashboardLoad() {
    await this.page
      .locator("h1, h2, [data-testid='dashboard-summary']")
      .first()
      .waitFor({ timeout: 15_000 });
  }
}
