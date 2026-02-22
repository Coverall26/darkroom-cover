import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for visual regression tests.
 *
 * Usage:
 *   npx playwright test                          # run all visual tests
 *   npx playwright test --update-snapshots       # regenerate baseline screenshots
 *   npx playwright test --project=chromium       # single browser
 *
 * Environment:
 *   BASE_URL — app origin (default http://localhost:3000)
 *   CI       — set in GitHub Actions, adjusts timeouts and retries
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  snapshotDir: "./e2e/snapshots",
  snapshotPathTemplate: "{snapshotDir}/{testFilePath}/{arg}{ext}",

  /* Maximum time one test can run */
  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // Allow 0.5% pixel difference for anti-aliasing variance across environments
      maxDiffPixelRatio: 0.005,
      // Animations must be disabled to get deterministic screenshots
      animations: "disabled",
    },
  },

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Reporter */
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "e2e/html-report" }]]
    : [["list"], ["html", { open: "on-failure", outputFolder: "e2e/html-report" }]],

  /* Shared settings for all the projects below */
  use: {
    baseURL: process.env.BASE_URL || "http://localhost:3000",
    /* Collect trace when retrying the failed test */
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "tablet",
      use: {
        ...devices["iPad Mini"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 7"] },
    },
  ],

  /* Start the dev server before running tests (only if not already running) */
  webServer: process.env.CI
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
