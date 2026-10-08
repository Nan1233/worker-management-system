import { test, expect } from '@playwright/test';
import { ACCOUNTS, API, apiToken, hashPath, loginManagement, route } from './helpers';

// Navigation contract per role against the real app (HashRouter URLs).

test.describe('Role navigation (real browser)', () => {
  test('lead: master data opens inside /lead, without the defect catalogue', async ({ page }) => {
    await loginManagement(page, ACCOUNTS.lead, /^\/lead/);
    const menu = page.getByRole('navigation', { name: 'Management navigation' });
    await expect(menu.getByRole('button', { name: 'Lỗi NG' })).toHaveCount(0);

    await menu.getByRole('button', { name: 'Máy móc' }).click();
    await expect.poll(() => hashPath(page)).toBe('/lead/master/machines');
    await expect(page.getByRole('tab')).toHaveText(['Máy', 'Sản phẩm & định mức', 'Trừ giờ']);

    await page.getByRole('tab', { name: 'Trừ giờ' }).click();
    await expect.poll(() => hashPath(page)).toBe('/lead/master/deductions');
    await expect(page.getByRole('tab', { name: 'Trừ giờ' })).toHaveAttribute('aria-selected', 'true');

    // The defect catalogue is manager/admin only; a typed URL falls back to machines.
    await page.goto(route('/lead/master/defects'));
    await expect.poll(() => hashPath(page)).toBe('/lead/master/machines');
  });

  test('lead: Excel page and approved page explain the Desktop requirement', async ({ page }) => {
    await loginManagement(page, ACCOUNTS.lead, /^\/lead/);
    await page.getByRole('navigation', { name: 'Management navigation' }).getByRole('button', { name: 'Xuất Excel' }).click();
    await expect.poll(() => hashPath(page)).toBe('/lead/export');
    await expect(page.getByTestId('desktop-excel-notice')).toBeVisible();
    await page.goto(route('/lead/approved'));
    await expect(page.getByTestId('desktop-excel-notice')).toBeVisible();
  });

  test('manager: master data tabs include defects and stay under /manager', async ({ page }) => {
    await loginManagement(page, ACCOUNTS.manager, /^\/manager/);
    await page.getByRole('navigation', { name: 'Management navigation' }).getByRole('button', { name: 'Lỗi NG' }).click();
    await expect.poll(() => hashPath(page)).toBe('/manager/master/defects');
    await expect(page.getByRole('tab')).toHaveText(['Máy', 'Sản phẩm & định mức', 'Lỗi NG', 'Trừ giờ']);

    // The "Thống kê" menu item opens the statistics page (it used to bounce back to the dashboard).
    await page.getByRole('navigation', { name: 'Management navigation' }).getByRole('button', { name: 'Thống kê' }).click();
    await expect.poll(() => hashPath(page)).toBe('/manager/statistics');
    await page.waitForTimeout(500);
    expect(hashPath(page)).toBe('/manager/statistics');
  });

  test('admin: reports/statistics/export menus exist; master tabs stay under /admin; process CRUD works', async ({ page }) => {
    await loginManagement(page, ACCOUNTS.admin, /^\/admin/);
    const menu = page.getByRole('navigation', { name: 'Điều hướng quản trị viên' });
    for (const [label, path] of [['Chờ duyệt', '/admin/reports'], ['Đã duyệt', '/admin/approved'], ['Thống kê', '/admin/statistics'], ['Xuất Excel', '/admin/export']] as const) {
      await menu.getByRole('button', { name: label }).click();
      await expect.poll(() => hashPath(page), label).toBe(path);
    }

    await page.goto(route('/admin/master/machines'));
    await page.getByRole('tab', { name: 'Lỗi NG' }).click();
    await expect.poll(() => hashPath(page)).toBe('/admin/master/defects');
    await expect(page.getByRole('tab', { name: 'Lỗi NG' })).toHaveAttribute('aria-selected', 'true');

    await page.getByRole('tab', { name: 'Công đoạn' }).click();
    await expect.poll(() => hashPath(page)).toBe('/admin/master/processes');
    await page.getByRole('button', { name: 'Thêm mới' }).click();
    const code = `E2E${Date.now().toString().slice(-6)}`;
    const inputs = page.locator('.modal-card input');
    await inputs.nth(0).fill(code);
    await inputs.nth(1).fill('Công đoạn kiểm thử E2E');
    const created = page.waitForResponse((r) => r.url().endsWith('/api/admin/master/processes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Lưu|Cập nhật|Tạo/ }).last().click();
    expect((await created).status()).toBe(201);
    await expect(page.locator('table')).toContainText(code);
  });

  test('lead: edits an approved report through the UI (route, save, new version)', async ({ page, request }) => {
    // Setup through the real API: a worker report approved by the manager.
    const workerToken = await apiToken(request, { username: ACCOUNTS.worker.code, access_type: 'worker' });
    const managerToken = await apiToken(request, { username: ACCOUNTS.manager.code, password: ACCOUNTS.manager.password, access_type: 'management' });
    // A fresh (date, shift) per run keeps duplicate detection (409) out of the way on a reused database.
    const n = Math.floor(Date.now() / 1000);
    const shift = ['A', 'B', 'C', 'D'][n % 4];
    const day = new Date(Date.now() + 7 * 3600_000 - (2 + (Math.floor(n / 4) % 9)) * 86400_000).toISOString().slice(0, 10); // VN today-2 .. today-10
    const created = await request.post(`${API}/api/production-temp`, {
      headers: { Authorization: `Bearer ${workerToken}` },
      data: { process_id: 6, work_date: day, shift, operation_mode: 'MANUAL', product_name: '0603', total_time: 2, actual_time: 2, deduction_time: 0, standard_output: 80, tt_ok: 40, tt_ng: 0, actual_output: 40, defects: [], deductions: [], client_request_id: `e2e-lead-${Date.now()}` }
    });
    expect(created.status(), await created.text()).toBe(201);
    const tempId = (await created.json()).id;
    const approved = await request.post(`${API}/api/production-temp/approve-selected`, { headers: { Authorization: `Bearer ${managerToken}` }, data: { ids: [tempId] } });
    expect(approved.status(), await approved.text()).toBe(200);
    const approvedId = (await approved.json()).data.approved_ids[0];

    await loginManagement(page, ACCOUNTS.lead, /^\/lead/);
    await page.goto(route(`/lead/report/${approvedId}?source=approved`));
    const edit = page.getByRole('button', { name: /Sửa báo cáo/ });
    await expect(edit).toBeEnabled({ timeout: 20_000 });
    await edit.click();
    await expect.poll(() => hashPath(page)).toBe(`/lead/report/${approvedId}/edit`);

    await page.locator('#ttOk').fill('35');
    const saved = page.waitForResponse((r) => new URL(r.url()).pathname === `/api/production/${approvedId}` && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    expect((await saved).status()).toBe(200);
    await expect.poll(() => hashPath(page)).toBe(`/lead/report/${approvedId}`);

    const leadToken = await apiToken(request, { username: ACCOUNTS.lead.code, password: ACCOUNTS.lead.password, access_type: 'management' });
    const detail = await request.get(`${API}/api/production/${approvedId}`, { headers: { Authorization: `Bearer ${leadToken}` } });
    expect(Number((await detail.json()).data.tt_ok)).toBe(35);
  });
});
