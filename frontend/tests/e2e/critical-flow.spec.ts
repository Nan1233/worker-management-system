import { test, expect, type Page } from '@playwright/test';
import { ACCOUNTS, API, apiToken, hashPath, loginManagement, loginWorker, phoneContext, route } from './helpers';

// Real browser + real frontend + real backend + real database
// (backend/tests/integration/e2e-server.js). Nothing is mocked and no step is
// skipped for missing credentials: the accounts are seeded by the e2e server.
//
//   pending -> REJECTED -> worker edits the SAME report -> pending -> APPROVED
//
// Excel: workbooks are produced by the Desktop app only, so on the web the
// export page must say so (and link to the Desktop download).

const state: { reportId: number; managerToken: string; workerToken: string } = { reportId: 0, managerToken: '', workerToken: '' };

async function openFirstPendingReport(page: Page) {
  await page.goto(route('/manager/reports'));
  await page.getByRole('button', { name: 'Tháng này' }).click();
  const row = page.locator('main table tbody tr').filter({ hasText: ACCOUNTS.worker.code }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  await expect(page.getByRole('button', { name: 'Từ chối' })).toBeEnabled({ timeout: 20_000 });
}

test.describe.serial('KTC Worker → Manager → Approval → Excel', () => {
  test.beforeAll(async ({ request }) => {
    state.managerToken = await apiToken(request, { username: ACCOUNTS.manager.code, password: ACCOUNTS.manager.password, access_type: 'management' });
    state.workerToken = await apiToken(request, { username: ACCOUNTS.worker.code, access_type: 'worker' });
  });

  test('worker submits a report through the real phone form', async ({ browser }) => {
    const context = await phoneContext(browser);
    const page = await context.newPage();
    await loginWorker(page);

    await page.goto(route('/worker/process/select'));
    await page.getByText('Xử lý bavia').first().click();
    await page.waitForSelector('#productName:not([disabled])', { timeout: 20_000 });
    await page.selectOption('#workerWorkDate', { index: 1 }); // "Hôm qua"
    await page.locator('input[name=shift]').first().check({ force: true });
    await page.locator('#productName').fill('0603');
    await page.locator('.autocomplete-menu .autocomplete-option-main').filter({ hasText: /^0603$/ }).click();
    await page.locator('.worker-time-part input').nth(0).fill('7');
    await page.locator('#ttOk').fill('100');

    await page.getByRole('button', { name: 'Nộp dữ liệu' }).click();
    // The form asks for confirmation and shows the hours that will be counted.
    await expect(page.getByText('Tổng thời gian hôm nay sau khi nộp')).toBeVisible();
    const created = page.waitForResponse((r) => new URL(r.url()).pathname.replace(/\/$/, '') === '/api/production-temp' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Xác nhận nộp' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    state.reportId = (await response.json()).id;
    expect(state.reportId).toBeGreaterThan(0);
    await expect(page.getByText('Báo cáo đã được gửi chờ duyệt')).toBeVisible();
    await context.close();
  });

  test('manager rejects it with a reason', async ({ browser, request }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginManagement(page, ACCOUNTS.manager, /^\/manager/);
    await openFirstPendingReport(page);

    await page.getByRole('button', { name: 'Từ chối' }).click();
    await page.locator('textarea').fill('Nhập sai số lượng OK');
    const rejected = page.waitForResponse((r) => r.url().endsWith('/api/production-temp/reject-selected'));
    await page.getByRole('button', { name: 'Xác nhận từ chối' }).click();
    expect((await rejected).status()).toBe(200);

    const detail = await request.get(`${API}/api/production-temp/${state.reportId}`, { headers: { Authorization: `Bearer ${state.managerToken}` } });
    expect(detail.status()).toBe(200);
    const report = (await detail.json()).data;
    expect(report.status).toBe('rejected');
    expect(report.review_note).toContain('Nhập sai số lượng OK');
    await context.close();
  });

  test('worker sees the reason, edits the SAME report and resubmits it', async ({ browser, request }) => {
    const context = await phoneContext(browser);
    const page = await context.newPage();
    await loginWorker(page);

    // The notification explains what happened…
    await page.goto(route('/worker/notifications'));
    await expect(page.getByText('Báo cáo đã bị từ chối')).toBeVisible();
    await expect(page.getByText(/Nhập sai số lượng OK/)).toBeVisible();
    await expect(page.getByText(/Báo cáo ngày \d{4}-\d{2}-\d{2}/)).toBeVisible();

    // …and the report detail offers the way back in.
    await page.goto(route(`/worker/history/${state.reportId}?source=temp`));
    const callout = page.getByTestId('worker-edit-callout');
    await expect(callout).toContainText('Báo cáo đã bị từ chối');
    await expect(callout).toContainText('Nhập sai số lượng OK');
    await callout.getByRole('button', { name: 'Sửa và gửi lại' }).click();
    await expect.poll(() => hashPath(page)).toBe(`/worker/history/${state.reportId}/edit`);

    await page.locator('#ttOk').fill('90');
    const saved = page.waitForResponse((r) => r.url().endsWith(`/api/production-temp/${state.reportId}`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    expect((await saved).status()).toBe(200);

    const detail = await request.get(`${API}/api/production-temp/${state.reportId}`, { headers: { Authorization: `Bearer ${state.workerToken}` } });
    const report = (await detail.json()).data;
    expect(report.status).toBe('pending');
    expect(Number(report.tt_ok)).toBe(90);
    expect(report.review_note ?? null).toBeNull();
    await context.close();
  });

  test('manager approves the corrected report; Excel page explains the Desktop requirement', async ({ browser, request }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginManagement(page, ACCOUNTS.manager, /^\/manager/);
    await openFirstPendingReport(page);

    const approved = page.waitForResponse((r) => r.url().endsWith('/api/production-temp/approve-selected'));
    await page.getByRole('button', { name: /Duyệt/ }).first().click();
    const confirm = page.getByRole('button', { name: /Xác nhận|Đồng ý/ });
    if (await confirm.count()) await confirm.first().click();
    expect((await approved).status()).toBe(200);

    const detail = await request.get(`${API}/api/production-temp/${state.reportId}`, { headers: { Authorization: `Bearer ${state.managerToken}` } });
    expect((await detail.json()).data.status).toBe('approved');

    await page.goto(route('/manager/approved'));
    await page.getByRole('button', { name: 'Tháng này' }).click();
    await expect(page.locator('main')).toContainText(ACCOUNTS.worker.code);
    await expect(page.getByTestId('desktop-excel-notice')).toBeVisible();

    await page.goto(route('/manager/export'));
    await expect(page.getByTestId('desktop-excel-notice')).toContainText('KTC Desktop');
    await expect(page.getByRole('link', { name: 'Tải KTC Desktop' })).toHaveAttribute('href', /github\.com\/.+\/releases/);
    await context.close();
  });
});
