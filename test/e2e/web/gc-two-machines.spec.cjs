'use strict';

// The most important flow: UI -> API request -> BE -> DB, verified back in the DB.
//
// Worker enters GC with two machines whose numbers differ completely:
//   Machine A: 4 h 30 min, deduction 30 min, OK 100, NG 5
//   Machine B: 6 h,        deductions 45 + 15 min, OK 240, NG 7 + 5
// Then the captured request and the stored machine lines must both show two
// separate lines, each with its own data.

const { test, expect, writeContext, loginWorkerUI } = require('./support.cjs');
const dbh = require('../lib/db-helpers.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');

const escape = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function pick(card, label, value) {
  const input = card.getByLabel(label, { exact: true });
  await input.fill(String(value));
  const option = card.getByRole('listbox').getByRole('button', { name: new RegExp(`^${escape(value)}\\b`) }).first();
  if (await option.isVisible().catch(() => false)) await option.click();
}

async function fillMachine(card, line, { hours, minutes }) {
  await pick(card, 'Mã máy', line.machine_code);
  await pick(card, 'Mã sản phẩm', line.product_code);
  // Hour/minute inputs carry no label; the existing data attribute is their stable handle.
  await card.locator('[data-machine-time-part="hours"]').fill(String(hours));
  await card.locator('[data-machine-time-part="minutes"]').fill(String(minutes));

  await card.getByRole('button', { name: /Thời gian trừ/ }).click();
  for (const d of line.deductions) await card.getByRole('checkbox', { name: new RegExp(escape(d.deduction_name)) }).check();
  for (const d of line.deductions) await card.getByRole('spinbutton', { name: new RegExp(escape(d.deduction_name)) }).fill(String(Math.round(d.hours * 60)));

  await card.getByRole('spinbutton', { name: 'OK' }).fill(String(line.ok_quantity));

  await card.getByRole('button', { name: /Chi tiết lỗi NG/ }).click();
  for (const d of line.defects) await card.getByRole('checkbox', { name: new RegExp(escape(d.defect_name)) }).check();
  for (const d of line.defects) await card.getByRole('textbox', { name: new RegExp(escape(d.defect_name)) }).fill(String(d.quantity));
  await expect(card.getByRole('spinbutton', { name: 'NG' })).toHaveValue(String(line.ng_quantity));
}

test.describe('GC two machines: FE -> BE -> DB', () => {
  let ctx;
  const runId = dbh.newRunId('WEB');
  test.beforeAll(async () => { ctx = await writeContext(); });
  test.afterAll(async () => {
    if (!ctx?.ok) return;
    try { await dbh.cleanupRun(ctx.db, runId); } finally { await ctx.close(); }
  });

  test('worker submits 2 machine lines; request and DB keep each line separate', async ({ page }) => {
    test.skip(!ctx.ok, ctx.reason);
    const master = await dbh.gcMasterData(ctx.db, ctx.fixture.gcProcessId);
    const lines = dbh.gcTwoMachineScenario({ machines: ctx.fixture.gcMachines, product: ctx.fixture.gcProduct, deductionTypes: master.deductions, defectTypes: master.defects });

    await loginWorkerUI(page, ctx.fixture.workerCode);
    await expect(page).toHaveURL(/\/worker/);
    await page.goto('/worker/process/cat-long');
    await page.getByRole('button', { name: 'Cắt', exact: true }).click();
    await page.getByRole('button', { name: 'Tự động', exact: true }).click();
    await page.getByRole('radio', { name: 'D', exact: true }).check();
    await page.getByLabel('Số máy').selectOption('2');
    const cards = page.getByRole('article');
    await fillMachine(cards.nth(0), lines[0], { hours: 4, minutes: 30 });
    await fillMachine(cards.nth(1), lines[1], { hours: 6, minutes: 0 });
    const note = page.getByLabel(/Ghi chú/);
    if (await note.count()) await note.first().fill(runId);

    const requestPromise = page.waitForRequest((r) => r.method() === 'POST' && /\/api\/production-temp\/?$/.test(new URL(r.url()).pathname));
    await page.getByRole('button', { name: 'Nộp dữ liệu' }).click();
    const confirm = page.getByRole('button', { name: 'Xác nhận nộp' });
    if (await confirm.isVisible({ timeout: 5000 }).catch(() => false)) await confirm.click();
    const request = await requestPromise;
    const response = await request.response();
    const sent = request.postDataJSON();
    const body = await response.json().catch(() => ({}));
    writeArtifact('web', 'gc-two-machines.request.json', sent);
    writeArtifact('web', 'gc-two-machines.response.json', { status: response.status(), body });

    // FE -> API: the request already carries two separate lines.
    expect(sent.machine_lines).toHaveLength(2);
    for (const [i, expected] of lines.entries()) {
      const line = sent.machine_lines[i];
      expect(String(line.machine_code)).toBe(String(expected.machine_code));
      expect(line.machine_time_hours).toBeCloseTo(expected.machine_time_hours, 6);
      expect(line.deduction_time_hours).toBeCloseTo(expected.deduction_time_hours, 6);
      expect(line.ok_quantity).toBe(expected.ok_quantity);
      expect(line.ng_quantity).toBe(expected.ng_quantity);
    }
    expect(response.status()).toBe(201);
    const tempId = body.id || body.data?.id;

    // BE -> DB: read the stored lines back.
    const stored = await dbh.tempMachineLines(ctx.db, tempId);
    writeArtifact('web', 'gc-two-machines.db.json', stored);
    expect(stored).toHaveLength(2);
    expect(new Set(stored.map((l) => l.machine_code)).size).toBe(2);
    for (const expected of lines) {
      const line = stored.find((l) => String(l.machine_code) === String(expected.machine_code));
      expect(Number(line.machine_time_hours)).toBeCloseTo(expected.machine_time_hours, 4);
      expect(Number(line.deduction_time_hours)).toBeCloseTo(expected.deduction_time_hours, 4);
      expect(Number(line.ok_quantity)).toBe(expected.ok_quantity);
      expect(Number(line.ng_quantity)).toBe(expected.ng_quantity);
      expect(line.deductions.map((d) => Number(d.deduction_type_id)).sort()).toEqual(expected.deductions.map((d) => d.deduction_type_id).sort());
      expect(line.defectRows.map((d) => [Number(d.defect_type_id), Number(d.quantity)]).sort()).toEqual(expected.defects.map((d) => [d.defect_type_id, d.quantity]).sort());
    }
    // Mark the run for cleanup even when the note field is not on the form.
    await ctx.db.query('UPDATE production_reports_temp SET note=CONCAT(COALESCE(note,\'\'),?) WHERE id=?', [` ${runId}`, tempId]);
  });
});
