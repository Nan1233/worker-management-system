import { defineConfig, devices } from '@playwright/test';

// Browser-only security smoke. No backend, test DB, account or external API.
// Starts a local Vite process on the isolated CI runner.
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'phase3-public-security.spec.ts',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'chromium-mobile', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173/#/login',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_API_URL: 'http://127.0.0.1:19999/api' },
  },
});
