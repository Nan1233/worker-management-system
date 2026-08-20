import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.KTC_FRONTEND_URL || 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    colorScheme: 'light',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { ...devices['iPhone 15'] } },
  ],
  webServer: process.env.KTC_PLAYWRIGHT_START_SERVER === '1'
    ? { command: 'npm run dev -- --host 127.0.0.1', url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
