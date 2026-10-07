'use strict';

const { test, expect, frontendReason, writeContext, loginWorkerUI, loginManagerUI } = require('./support.cjs');

test.describe('auth (UI)', () => {
  test.beforeEach(() => {
    test.skip(Boolean(frontendReason()), frontendReason());
  });

  test('login page shows the employee-code step', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('region', { name: 'Đăng nhập hệ thống KTC' })).toBeVisible();
    await expect(page.getByLabel('Mã nhân viên', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Tiếp tục/ })).toBeEnabled();
  });

  test('empty employee code is refused on the client', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: /Tiếp tục/ }).click();
    await expect(page.getByRole('alert')).toHaveText(/Vui lòng nhập mã nhân viên/);
    await expect(page).toHaveURL(/\/login/);
  });

  test('worker and manager areas redirect to /login without a session', async ({ page }) => {
    await page.goto('/worker');
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/manager');
    await expect(page).toHaveURL(/\/login/);
  });

  test('FE -> BE: login against a backend without database shows its error and stays on /login', async ({ page }) => {
    test.skip(process.env.E2E_INTERNAL_API_MODE !== 'local-no-db', 'only meaningful against the suite\'s local no-DB backend');
    const responsePromise = page.waitForResponse((r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST', { timeout: 20_000 });
    await loginWorkerUI(page, 'E2E0000');
    const response = await responsePromise;
    expect(response.status()).toBe(503);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test.describe('with E2E database', () => {
    let ctx;
    test.beforeAll(async () => { ctx = await writeContext(); });
    test.afterAll(async () => { if (ctx?.ok) await ctx.close(); });

    test('worker logs in through the UI and reaches /worker', async ({ page }) => {
      test.skip(!ctx.ok, ctx.reason);
      await loginWorkerUI(page, ctx.fixture.workerCode);
      await expect(page).toHaveURL(/\/worker/);
    });

    test('manager logs in through the UI and reaches /manager', async ({ page }) => {
      test.skip(!ctx.ok, ctx.reason);
      await loginManagerUI(page, ctx.fixture.managerUsername, ctx.fixture.managerPassword);
      await expect(page).toHaveURL(/\/manager/);
    });
  });
});
