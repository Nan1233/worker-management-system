import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.KTC_FRONTEND_URL || 'http://127.0.0.1:5173';
const apiPort = process.env.KTC_E2E_API_PORT || '19080';
// Optional: use a pre-installed Chromium instead of the Playwright-managed download.
const chromiumPath = process.env.KTC_CHROMIUM_PATH;

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
    ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath, args: ['--no-sandbox'] } } : {}),
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'chromium-mobile', use: { ...devices['iPhone 15'] } },
  ],
  // KTC_PLAYWRIGHT_START_SERVER=1 starts the REAL backend (fresh throw-away database,
  // seeded accounts; needs KTC_IT_DB_* with a ktc_it_* database name) and the web app.
  webServer: process.env.KTC_PLAYWRIGHT_START_SERVER === '1'
    ? [
        {
          command: 'node ../backend/tests/integration/e2e-server.js',
          url: `http://127.0.0.1:${apiPort}/api/health/live`,
          reuseExistingServer: true,
          timeout: 120_000,
          env: { ...process.env as Record<string, string>, KTC_E2E_API_PORT: apiPort, CORS_ORIGINS: baseURL },
        },
        {
          command: 'npm run dev -- --host 127.0.0.1 --port 5173',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
          env: { ...process.env as Record<string, string>, VITE_API_URL: `http://127.0.0.1:${apiPort}/api` },
        },
      ]
    : undefined,
});
