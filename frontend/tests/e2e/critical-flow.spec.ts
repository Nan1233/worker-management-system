import { test, expect, request } from '@playwright/test';

const apiBase = process.env.KTC_E2E_API_URL || 'http://127.0.0.1:19080';
const workerCode = process.env.KTC_E2E_WORKER_CODE || '';
const managerUsername = process.env.KTC_E2E_MANAGER_USERNAME || '';
const managerPassword = process.env.KTC_E2E_MANAGER_PASSWORD || '';

function requireCredentials() {
  if (!workerCode || !managerUsername || !managerPassword) test.skip(true, 'Set KTC_E2E_WORKER_CODE, KTC_E2E_MANAGER_USERNAME and KTC_E2E_MANAGER_PASSWORD for write-path E2E.');
}

test.describe('KTC Worker → Manager → Approval → Excel', () => {
  test('real browser critical flow', async ({ browser }) => {
    requireCredentials();
    const api = await request.newContext({ baseURL: apiBase });

    const workerLogin = await api.post('/api/auth/login', { data: { username: workerCode, access_type: 'worker' } });
    expect(workerLogin.ok()).toBeTruthy();
    const workerState = await api.storageState();
    const workerContext = await browser.newContext({ storageState: workerState });
    const workerPage = await workerContext.newPage();
    await workerPage.goto(`${process.env.KTC_FRONTEND_URL || 'http://127.0.0.1:5173'}/worker`);
    await expect(workerPage).toHaveURL(/\/worker/);
    await expect(workerPage.locator('body')).toContainText(/công đoạn|sản xuất|worker/i);
    await workerContext.close();

    const managerLogin = await api.post('/api/auth/login', { data: { username: managerUsername, password: managerPassword, access_type: 'management' } });
    expect(managerLogin.ok()).toBeTruthy();
    const managerData = await managerLogin.json();
    expect(managerData.user?.role || managerData.data?.user?.role).toMatch(/manager|admin|lead/);
    const managerState = await api.storageState();
    const managerContext = await browser.newContext({ storageState: managerState });
    const managerPage = await managerContext.newPage();
    await managerPage.goto(`${process.env.KTC_FRONTEND_URL || 'http://127.0.0.1:5173'}/manager`);
    await expect(managerPage).toHaveURL(/\/manager/);
    await expect(managerPage.locator('body')).toContainText(/dashboard|báo cáo|quản lý/i);

    const pending = await api.get('/api/production-temp/pending');
    expect([200, 403]).toContain(pending.status());
    if (pending.status() === 200) {
      const pendingData = await pending.json();
      const reports = pendingData.data?.reports || pendingData.data || [];
      const candidate = Array.isArray(reports) ? reports.find(Boolean) : null;
      if (candidate?.id) {
        const approval = await api.post('/api/production-temp/approve-selected', { data: { ids: [candidate.id] } });
        expect([200, 409, 422]).toContain(approval.status());
      }
    }

    const excel = await api.get('/api/reports/export-excel/company-data?month=' + new Date().toISOString().slice(0, 7));
    expect([200, 403]).toContain(excel.status());
    await expect(managerPage.locator('body')).toHaveScreenshot('manager-dashboard-authenticated.png', { fullPage: true, animations: 'disabled' });
    await managerContext.close();
    await api.dispose();
  });
});
