'use strict';

// Started by `node test/e2e/full.cjs --layer web`, which provides
// E2E_FRONTEND_URL (a Vite dev server it starts, or one the operator gives).

const path = require('node:path');
const { defineConfig, devices } = require('@playwright/test');
const config = require('../lib/config.cjs');

const outputDir = path.join(config.ARTIFACT_ROOT, 'web', 'playwright');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.cjs$/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir,
  reporter: [[path.join(__dirname, '..', 'lib', 'playwright-reporter.cjs')]],
  use: {
    baseURL: process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    colorScheme: 'light',
    launchOptions: process.env.E2E_CHROMIUM_PATH ? { executablePath: process.env.E2E_CHROMIUM_PATH } : {}
  },
  projects: [{ name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }]
});
