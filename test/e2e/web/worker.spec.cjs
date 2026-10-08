'use strict';

// Worker UI up to the GC machine form (no submit; gc-two-machines.spec.cjs submits).

const { test, expect, writeContext, loginWorkerUI } = require('./support.cjs');

test.describe('worker (UI)', () => {
  let ctx;
  test.beforeAll(async () => { ctx = await writeContext(); });
  test.afterAll(async () => { if (ctx?.ok) await ctx.close(); });

  test('login -> choose Gia công -> form offers 2 independent machine cards', async ({ page }) => {
    test.skip(!ctx.ok, ctx.reason);
    await loginWorkerUI(page, ctx.fixture.workerCode);
    await expect(page).toHaveURL(/\/worker/);
    await page.goto('/worker/process/select');
    await page.getByRole('button', { name: /Gia công/ }).first().click();
    await expect(page).toHaveURL(/\/worker\/process\/cat-long/);

    await page.getByRole('button', { name: 'Cắt', exact: true }).click();
    await page.getByRole('button', { name: 'Tự động', exact: true }).click();
    await page.getByLabel('Số máy').selectOption('2');

    const cards = page.getByRole('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText('Máy 1');
    await expect(cards.nth(1)).toContainText('Máy 2');
    for (const i of [0, 1]) {
      await expect(cards.nth(i).getByLabel('Mã máy')).toBeVisible();
      await expect(cards.nth(i).getByRole('spinbutton', { name: 'OK' })).toBeVisible();
      await expect(cards.nth(i).getByRole('button', { name: /Thời gian trừ/ })).toBeVisible();
      await expect(cards.nth(i).getByRole('button', { name: /Chi tiết lỗi NG/ })).toBeVisible();
    }
  });
});
