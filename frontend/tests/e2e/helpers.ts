import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

// The app uses HashRouter: every in-app URL is  <origin>/#/<route>.
export const WEB = (process.env.KTC_FRONTEND_URL || 'http://127.0.0.1:5173').replace(/\/$/, '');
export const API = (process.env.KTC_E2E_API_URL || 'http://127.0.0.1:19080').replace(/\/$/, '');

// Accounts seeded by backend/tests/integration/e2e-server.js
export const ACCOUNTS = {
  worker: { code: process.env.KTC_E2E_WORKER_CODE || 'E2E-W1' },
  manager: { code: process.env.KTC_E2E_MANAGER_USERNAME || 'e2e-manager', password: process.env.KTC_E2E_MANAGER_PASSWORD || 'Passw0rd!x' },
  lead: { code: 'e2e-lead', password: process.env.KTC_E2E_MANAGER_PASSWORD || 'Passw0rd!x' },
  admin: { code: 'e2e-admin', password: process.env.KTC_E2E_MANAGER_PASSWORD || 'Passw0rd!x' },
};

export const route = (path: string) => `${WEB}/#${path}`;
export const hashPath = (page: Page) => new URL(page.url()).hash.replace(/^#/, '').split('?')[0];

/** Phone-sized Chromium context (touch + mobile viewport) for the worker flow. */
export async function phoneContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
}

export async function loginWorker(page: Page, code = ACCOUNTS.worker.code) {
  await page.goto(route('/login'));
  await page.getByPlaceholder('Nhập mã nhân viên').fill(code);
  await page.getByRole('button', { name: /Tiếp tục/ }).click();
  await page.getByTestId('login-role-worker').click();
  await expect.poll(() => hashPath(page), { timeout: 15_000 }).toBe('/worker');
}

export async function loginManagement(page: Page, account: { code: string; password: string }, home: RegExp) {
  await page.goto(route('/login'));
  await page.getByPlaceholder('Nhập mã nhân viên').fill(account.code);
  await page.getByRole('button', { name: /Tiếp tục/ }).click();
  await page.getByTestId('login-role-management').click();
  await page.locator('input[type=password]').fill(account.password);
  await page.getByRole('button', { name: /Đăng nhập|Tiếp tục|Vào/ }).first().click();
  await expect.poll(() => hashPath(page), { timeout: 15_000 }).toMatch(home);
}

/** Real API login, used only to verify database truth after UI actions. */
export async function apiToken(request: import('@playwright/test').APIRequestContext, body: Record<string, unknown>): Promise<string> {
  const res = await request.post(`${API}/api/auth/login`, { data: body });
  expect(res.status(), await res.text()).toBe(200);
  const json = await res.json();
  return json.token || json.accessToken;
}
