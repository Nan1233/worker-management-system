import { test, expect } from '@playwright/test';

test('Worker can log in with employee code only and reach the worker home', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByPlaceholder('Nhập mã nhân viên').fill('E2E-W1');
  await page.getByRole('button', { name: /Tiếp tục/ }).click();

  const loginResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/auth/login') &&
    response.request().method() === 'POST'
  );

  await page.getByTestId('login-role-worker').click();

  const response = await loginResponsePromise;
  expect(response.status(), 'Worker login API should return HTTP 200').toBe(200);

  const requestBody = response.request().postDataJSON() as Record<string, unknown>;
  expect(requestBody.username).toBe('E2E-W1');
  expect(requestBody.access_type).toBe('worker');

  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.user?.role).toBe('worker');
  expect(Boolean(body.accessToken || body.token), 'Login response should contain an access token').toBe(true);

  await expect.poll(() => new URL(page.url()).hash.replace(/^#/, '').split('?')[0], {
    timeout: 15_000,
  }).toBe('/worker');
});
