import { type Page, type Locator } from "@playwright/test";

/**
 * Page Object Model for the GP Admin Dashboard.
 * Encapsulates selectors and actions for visual regression tests.
 */
export class AdminDashboardPage {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly header: Locator;
  readonly statsGrid: Locator;
  readonly pipelineChart: Locator;
  readonly quickActions: Locator;
  readonly activityFeed: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator('[data-testid="admin-sidebar"]');
    this.header = page.locator('[data-testid="dashboard-header"]');
    this.statsGrid = page.locator('[data-testid="stats-grid"]');
    this.pipelineChart = page.locator('[data-testid="pipeline-chart"]');
    this.quickActions = page.locator('[data-testid="quick-actions"]');
    this.activityFeed = page.locator('[data-testid="activity-feed"]');
  }

  async goto() {
    await this.page.goto("/admin/dashboard");
    await this.page.waitForLoadState("networkidle");
  }

  async waitForDashboardLoad() {
    // Wait for key content to appear — either data or empty state
    await this.page
      .locator("h1, h2, [data-testid='stats-grid']")
      .first()
      .waitFor({ timeout: 15_000 });
  }

  async screenshotFullPage(name: string) {
    return this.page.screenshot({ fullPage: true, path: undefined });
  }
}
