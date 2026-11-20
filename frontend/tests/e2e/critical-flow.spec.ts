import { test, expect, type Page } from '@playwright/test';
import { ACCOUNTS, API, apiToken, loginManagement, loginWorker, phoneContext, projectAccount, route } from './helpers';

// Real browser + real frontend + real backend + real database
// (backend/tests/integration/e2e-server.js). Nothing is mocked and no step is
// skipped for missing credentials: the accounts are seeded by the e2e server.
//
//   worker submits -> manager rejects -> worker sees reason but cannot edit rejected
//   -> another synthetic pending report -> manager approves it (current business policy)
//
// Excel: workbooks are produced by the Desktop app only, so on the web the
// export page must say so (and link to the Desktop download).

const state: { reportId: number; approvableId: number; approvableDate: string; managerToken: string; workerToken: string; workerCode: string } = { reportId: 0, approvableId: 0, approvableDate: '', managerToken: '', workerToken: '', workerCode: '' };

async function openFirstPendingReport(page: Page, reportId: number) {
  await page.goto(route('/manager/reports'));
  await page.getByRole('button', { name: 'Tháng này' }).click();
  const row = page.locator(`main table tbody tr[data-report-id="${reportId}"]`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();
  // ManagerReportWorkspace routes row clicks to ReportReviewDetail, not the old inline panel.
  await expect(page.locator('button.review-btn.reject')).toBeEnabled({ timeout: 20_000 });
}

test.describe.serial('KTC Worker → Manager → Approval → Excel', () => {
  test.beforeAll(async ({ request }, testInfo) => {
    state.workerCode = projectAccount(testInfo, 'worker');
    state.managerToken = await apiToken(request, { username: ACCOUNTS.manager.code, password: ACCOUNTS.manager.password, access_type: 'management' });
    state.workerToken = await apiToken(request, { username: state.workerCode, access_type: 'worker' });
  });

  test('worker submits a report through the real phone form', async ({ browser }) => {
    const context = await phoneContext(browser);
    const page = await context.newPage();
    await loginWorker(page, state.workerCode);

    await page.goto(route('/worker/process/select'));
    await page.getByText('Xử lý bavia').first().click();
    await page.waitForSelector('#productName:not([disabled])', { timeout: 20_000 });
    await page.selectOption('#workerWorkDate', { index: 1 }); // "Hôm qua"
    await page.locator('input[name=shift]').first().check({ force: true });
    await page.locator('#productName').fill('0603');
    await page.locator('.autocomplete-menu .autocomplete-option-main').filter({ hasText: /^0603$/ }).click();
    await page.locator('.worker-time-part input').nth(0).fill('7');
    await page.locator('#ttOk').fill('100');

    // Current form intentionally submits with one click, no second generic confirmation.
    const created = page.waitForResponse((r) => new URL(r.url()).pathname.replace(/\/$/, '') === '/api/production-temp' && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Nộp dữ liệu' }).click();
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
    await openFirstPendingReport(page, state.reportId);

    // The native review-detail page uses its own reason/details modal, not the list bulk dialog.
    await page.locator('button.review-btn.reject').click();
    await expect(page.locator('.review-modal')).toBeVisible();
    await page.locator('.review-modal textarea').fill('Nhập sai số lượng OK');
    const rejected = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/production-temp/reject-selected');
    await page.locator('.review-modal button.reject').click();
    expect((await rejected).status()).toBe(200);

    const detail = await request.get(`${API}/api/production-temp/${state.reportId}`, { headers: { Authorization: `Bearer ${state.managerToken}` } });
    expect(detail.status()).toBe(200);
    const report = (await detail.json()).data;
    expect(report.status).toBe('rejected');
    expect(report.review_note).toContain('Nhập sai số lượng OK');
    await context.close();
  });

  test('worker sees rejection, and current policy refuses any edit to the rejected report', async ({ browser, request }) => {
    const context = await phoneContext(browser);
    const page = await context.newPage();
    await loginWorker(page, state.workerCode);
    await page.goto(route('/worker/notifications'));
    await expect(page.getByText('Báo cáo đã bị từ chối')).toBeVisible();
    await expect(page.getByText(/Nhập sai số lượng OK/)).toBeVisible();

    await page.goto(route(`/worker/history/${state.reportId}?source=temp`));
    const callout = page.getByTestId('worker-edit-callout');
    await expect(callout).toContainText('Báo cáo đã bị từ chối');
    const detail = await request.get(`${API}/api/production-temp/${state.reportId}`, { headers: { Authorization: `Bearer ${state.workerToken}` } });
    expect(detail.status()).toBe(200);
    const snapshot = (await detail.json()).data;
    const denied = await request.put(`${API}/api/production-temp/${state.reportId}`, {
      headers: { Authorization: `Bearer ${state.workerToken}` },
      data: { tt_ok: 90, actual_output: 90, expected_updated_at: snapshot.updated_at }
    });
    expect(denied.status()).toBe(422);
    expect((await denied.json()).code).toBe('WORKER_REPORT_STATUS_NOT_EDITABLE');
    await context.close();

    // Use a separate, real API-created pending report for the approved-flow smoke:
    // rejected reports cannot be resubmitted under the current customer policy.
    const date = new Date(Date.now() + 7 * 3600_000 - 2 * 86400_000).toISOString().slice(0,10);
    const created = await request.post(`${API}/api/production-temp`, {
      headers: { Authorization: `Bearer ${state.workerToken}` },
      data: {
        process_id: 6, work_date: date, shift: 'D', operation_mode: 'MANUAL',
        product_name: '0603', total_time: 2, actual_time: 2, deduction_time: 0,
        standard_output: 80, tt_ok: 90, tt_ng: 0, actual_output: 90,
        defects: [], deductions: [], client_request_id: `e2e-approval-${Date.now()}`
      }
    });
    expect(created.status(), await created.text()).toBe(201);
    state.approvableId = (await created.json()).id;
    state.approvableDate = date;
    expect(state.approvableId).toBeGreaterThan(0);
  });

  test('manager approves a separate pending report; Excel page explains Desktop requirement', async ({ browser, request }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await loginManagement(page, ACCOUNTS.manager, /^\/manager/);
    // The first scenario already covers choosing a row in the pending table.
    // The independently seeded approval smoke checks a deep link to its exact
    // report ID; the list is paginated and need not show this report on page 1.
    const pending = await request.get(`${API}/api/production-temp/${state.approvableId}`, {
      headers: { Authorization: `Bearer ${state.managerToken}` }
    });
    expect(pending.status(), await pending.text()).toBe(200);
    expect((await pending.json()).data.status).toBe('pending');
    await page.goto(route(`/manager/report/review?source=pending&date=${state.approvableDate}&id=${state.approvableId}`));
    await expect(page.locator('.review-title')).toContainText(state.workerCode);
    await expect(page.locator('button.review-btn.approve')).toBeEnabled();

    const approved = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/production-temp/approve-selected');
    await page.locator('button.review-btn.approve').click();
    expect((await approved).status()).toBe(200);

    const detail = await request.get(`${API}/api/production-temp/${state.approvableId}`, { headers: { Authorization: `Bearer ${state.managerToken}` } });
    expect((await detail.json()).data.status).toBe('approved');

    await page.goto(route('/manager/approved'));
    await page.getByRole('button', { name: 'Tháng này' }).click();
    await expect(page.locator('main')).toContainText(state.workerCode);
    await expect(page.getByTestId('desktop-excel-notice')).toBeVisible();

    await page.goto(route('/manager/export'));
    await expect(page.getByTestId('desktop-excel-notice')).toContainText('KTC Desktop');
    await expect(page.getByRole('link', { name: 'Tải KTC Desktop' })).toHaveAttribute('href', /github\.com\/.+\/releases/);
    await context.close();
  });
});
