import { test, expect } from '@playwright/test';
import { ACCOUNTS, hashPath, loginManagement, route } from './helpers';

// Password change for management accounts (real app, real API).
// Uses the dedicated seeded account "e2e-pw" so the shared accounts keep their password.

const OLD = ACCOUNTS.manager.password;
const NEW = 'MatKhauMoi#2026';

test('manager changes own password; session ends; only the new password signs in', async ({ page }) => {
  await loginManagement(page, { code: 'e2e-pw', password: OLD }, /^\/manager/);
  await page.goto(route('/manager/profile'));
  const card = page.getByTestId('change-password-card');
  await expect(card).toBeVisible();

  // Client-side checks (no request is sent)
  await card.locator('#currentPassword').fill(OLD);
  await card.locator('#newPassword').fill('short');
  await card.locator('#confirmPassword').fill('short');
  await card.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(card.getByRole('alert')).toContainText('tối thiểu 8 ký tự');

  // Server-side check: wrong current password
  await card.locator('#currentPassword').fill('sai-mat-khau');
  await card.locator('#newPassword').fill(NEW);
  await card.locator('#confirmPassword').fill(NEW);
  const rejected = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/password');
  await card.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  expect((await rejected).status()).toBe(400);
  await expect(card.getByRole('alert')).toContainText('Mật khẩu hiện tại không đúng');
  await expect.poll(() => hashPath(page)).toBe('/manager/profile'); // not signed out by a wrong password

  // Success
  await card.locator('#currentPassword').fill(OLD);
  const changed = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/auth/password');
  await card.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  expect((await changed).status()).toBe(200);
  await expect(card.getByRole('status')).toContainText('Đổi mật khẩu thành công');
  await expect.poll(() => hashPath(page), { timeout: 10_000 }).toBe('/login');

  // The old password is refused, the new one works.
  await page.getByPlaceholder('Nhập mã nhân viên').fill('e2e-pw');
  await page.getByRole('button', { name: /Tiếp tục/ }).click();
  await page.getByTestId('login-role-management').click();
  await page.locator('input[type=password]').fill(OLD);
  await page.getByRole('button', { name: /Đăng nhập|Tiếp tục|Vào/ }).first().click();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.locator('input[type=password]').fill(NEW);
  await page.getByRole('button', { name: /Đăng nhập|Tiếp tục|Vào/ }).first().click();
  await expect.poll(() => hashPath(page), { timeout: 15_000 }).toMatch(/^\/manager/);
});

test('workers do not get a change-password card (they have no password)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(route('/login'));
  await page.getByPlaceholder('Nhập mã nhân viên').fill(ACCOUNTS.worker.code);
  await page.getByRole('button', { name: /Tiếp tục/ }).click();
  await page.getByTestId('login-role-worker').click();
  await expect.poll(() => hashPath(page)).toBe('/worker');
  await page.goto(route('/worker/profile'));
  await expect(page.getByRole('button', { name: /Đăng xuất/ }).first()).toBeVisible();
  await expect(page.getByTestId('change-password-card')).toHaveCount(0);
  await context.close();
});
