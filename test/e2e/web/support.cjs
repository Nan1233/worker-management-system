'use strict';

// Shared Playwright fixtures: console + network capture (masked) for every test,
// environment gating, and UI login helpers using role/label/text selectors.

const base = require('@playwright/test');
const { writeArtifact } = require('../lib/reporter.cjs');
const dbh = require('../lib/db-helpers.cjs');

const frontendReason = () => (process.env.E2E_FRONTEND_URL
  ? ''
  : (process.env.E2E_WEB_UNAVAILABLE || 'frontend not available (set E2E_FRONTEND_URL or let test/e2e/full.cjs start Vite)'));

const test = base.test.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleLines = [];
    const network = [];
    page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => consoleLines.push(`[pageerror] ${error.message}`));
    page.on('requestfinished', async (request) => {
      if (!/\/api\//.test(request.url())) return;
      const response = await request.response().catch(() => null);
      let body = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      network.push({ method: request.method(), url: request.url(), status: response?.status() ?? null, request: body });
    });
    await use(page);
    const name = testInfo.titlePath.slice(1).join('-');
    writeArtifact('web', `${name}.console.log`, consoleLines.join('\n'));
    writeArtifact('web', `${name}.network.json`, network);
    if (testInfo.status !== testInfo.expectedStatus) {
      await page.screenshot({ path: testInfo.outputPath('failure.png'), fullPage: true }).catch(() => {});
    }
  }
});

/** Write context for UI flows that create data; reason is set when it must SKIP. */
async function writeContext() {
  if (frontendReason()) return { ok: false, reason: frontendReason() };
  return dbh.prepareWriteContext({ layer: 'web' });
}

async function loginWorkerUI(page, workerCode) {
  await page.goto('/login');
  await page.getByLabel('Mã nhân viên', { exact: true }).fill(workerCode);
  await page.getByRole('button', { name: /Tiếp tục/ }).click();
  await page.getByRole('button', { name: /Công nhân/ }).click();
}

async function loginManagerUI(page, username, password) {
  await page.goto('/login');
  await page.getByLabel('Mã nhân viên', { exact: true }).fill(username);
  await page.getByRole('button', { name: /Tiếp tục/ }).click();
  await page.getByRole('button', { name: /Quản lý/ }).click();
  await page.getByLabel('Mật khẩu quản lý').fill(password);
  await page.getByRole('button', { name: /^Đăng nhập/ }).click();
}

module.exports = { test, expect: base.expect, frontendReason, writeContext, loginWorkerUI, loginManagerUI };
