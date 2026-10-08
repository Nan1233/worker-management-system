import { test, expect } from '@playwright/test';

test.describe('KTC critical visual surfaces', () => {
  test('login desktop matches baseline', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('body')).toHaveScreenshot('login-desktop.png', { fullPage: true, animations: 'disabled' });
  });

  test('login mobile matches baseline', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('body')).toHaveScreenshot('login-mobile.png', { fullPage: true, animations: 'disabled' });
  });

  // HashRouter: protected routes are /#/manager and /#/worker. An unauthenticated
  // visitor must end on /#/login, and no API token may be created along the way.
  test('management route remains protected', async ({ page }) => {
    await page.goto('/#/manager');
    await expect(page).toHaveURL(/#\/login/);
    expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => /token/i.test(key)))).toEqual([]);
  });

  test('worker route remains protected', async ({ page }) => {
    await page.goto('/#/worker');
    await expect(page).toHaveURL(/#\/login/);
  });
});
