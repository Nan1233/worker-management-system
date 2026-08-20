import { test, expect } from '@playwright/test';

test.describe('KTC critical visual surfaces', () => {
  test('login desktop matches baseline', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toHaveScreenshot('login-desktop.png', { fullPage: true, animations: 'disabled' });
  });

  test('login mobile matches baseline', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toHaveScreenshot('login-mobile.png', { fullPage: true, animations: 'disabled' });
  });

  test('management route remains protected', async ({ page }) => {
    await page.goto('/manager');
    await expect(page).toHaveURL(/\/login/);
  });

  test('worker route remains protected', async ({ page }) => {
    await page.goto('/worker');
    await expect(page).toHaveURL(/\/login/);
  });
});
