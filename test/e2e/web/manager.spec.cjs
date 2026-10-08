'use strict';

// Manager: login -> sees the pending GC report -> approves it in the UI -> DB has
// the approved copy with both machine lines.

const { test, expect, writeContext, loginManagerUI } = require('./support.cjs');
const dbh = require('../lib/db-helpers.cjs');
const { E2EClient } = require('../lib/api-client.cjs');

test.describe('manager (UI)', () => {
  let ctx;
  const runId = dbh.newRunId('WEBMGR');
  test.beforeAll(async () => { ctx = await writeContext(); });
  test.afterAll(async () => {
    if (!ctx?.ok) return;
    try { await dbh.cleanupRun(ctx.db, runId); } finally { await ctx.close(); }
  });

  test('manager sees the pending GC report and approves it', async ({ page }) => {
    test.skip(!ctx.ok, ctx.reason);
    // Arrange through the API (the worker UI path is covered by gc-two-machines.spec.cjs).
    const worker = new E2EClient(ctx.target.baseUrl, { layer: 'web', label: 'worker-arrange' });
    expect((await worker.loginWorker(ctx.fixture.workerCode)).status).toBe(200);
    const master = await dbh.gcMasterData(ctx.db, ctx.fixture.gcProcessId);
    const lines = dbh.gcTwoMachineScenario({ machines: ctx.fixture.gcMachines, product: ctx.fixture.gcProduct, deductionTypes: master.deductions, defectTypes: master.defects });
    const created = await worker.req('POST', '/api/production-temp', dbh.gcPayload({ processId: ctx.fixture.gcProcessId, lines, runId, workDate: dbh.localDate(-7), shift: 'C' }));
    expect(created.status).toBe(201);
    const tempId = created.data?.id || created.data?.data?.id;

    await loginManagerUI(page, ctx.fixture.managerUsername, ctx.fixture.managerPassword);
    await expect(page).toHaveURL(/\/manager/);
    await page.goto('/manager/reports');
    const row = page.getByRole('row').filter({ hasText: ctx.fixture.gcProduct }).filter({ hasText: String(lines[0].machine_code) }).first();
    await expect(row).toBeVisible();
    await row.getByRole('checkbox').check();
    const approved = page.waitForResponse((r) => /approve-selected/.test(r.url()) && r.request().method() === 'POST');
    await page.getByRole('button', { name: /Duyệt/ }).first().click();
    const confirm = page.getByRole('button', { name: /Xác nhận|Duyệt/ }).last();
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
    expect((await approved).status()).toBe(200);

    const [report] = await dbh.approvedReportForTemp(ctx.db, tempId);
    expect(report, 'approved production_reports row').toBeTruthy();
    expect(await dbh.approvedMachineLines(ctx.db, report.id)).toHaveLength(2);
  });
});
