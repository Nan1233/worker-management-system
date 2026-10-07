'use strict';

// API -> BE -> DB: the submitted GC report lands in production_reports_temp once,
// with the values the worker sent.

const test = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../lib/db-helpers.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');
const { useWriteContext, needs } = require('../api/context.cjs');

const write = useWriteContext('db', { dayOffset: 3 });

test('GC submit creates exactly one production_reports_temp row with the sent header data', needs(write, async () => {
  const worker = await write.worker();
  const { response, payload } = await write.submitGc(worker);
  assert.equal(response.status, 201, JSON.stringify(response.data)?.slice(0, 300));
  const rows = await dbh.tempReportByNote(write.ctx.db, write.runId);
  writeArtifact('db', 'production-temp-row.json', rows);
  assert.equal(rows.length, 1);
  const [row] = rows;
  assert.equal(Number(row.id), Number(response.data?.id || response.data?.data?.id));
  assert.equal(Number(row.process_id), write.ctx.fixture.gcProcessId);
  assert.equal(String(row.work_date).slice(0, 10), payload.work_date);
  assert.equal(row.shift, payload.shift);
  assert.equal(String(row.operation_mode).toUpperCase(), 'MACHINE');
  assert.equal(Number(row.tt_ok), 340);
  assert.equal(Number(row.tt_ng), 17);
}));

test('approved GC report is exported as one 04_CAT_LONG row per machine line', needs(write, async (t) => {
  const worker = await write.worker();
  const { response, payload, lines } = await write.submitGc(worker, '-export');
  assert.equal(response.status, 201);
  const tempId = response.data?.id || response.data?.data?.id;
  const manager = await write.manager();
  assert.equal((await manager.req('POST', '/api/production-temp/approve-selected', { ids: [tempId] })).status, 200);

  const res = await fetch(`${write.ctx.target.baseUrl}/api/reports/export-excel/company-file`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${manager.token}`, ...(manager.cookies ? { cookie: manager.cookies } : {}) },
    body: JSON.stringify({ date: payload.work_date, groupCode: 'GIA_CONG' })
  });
  if (res.status === 503) return t.skip('backend has ENABLE_SERVER_COMPANY_EXCEL off (DESKTOP_EXCEL_REQUIRED); server-side GC workbook not available');
  assert.equal(res.status, 200, await res.clone().text().catch(() => ''));
  const buffer = Buffer.from(await res.arrayBuffer());
  const x = require('../lib/xlsx-helpers.cjs');
  const file = require('node:path').join(require('../lib/config.cjs').layerDir('db'), 'company-gia-cong-from-db.xlsx');
  require('node:fs').writeFileSync(file, buffer);
  const workbook = await x.loadBuffer(buffer);
  const sheet = workbook.getWorksheet(x.GC_SHEET);
  assert.ok(sheet, `sheet ${x.GC_SHEET} in ${file}`);
  const ours = [];
  sheet.eachRow((row, n) => {
    const product = x.cellText(row.getCell(24).value);
    const shift = x.cellText(row.getCell(5).value);
    if (product === write.ctx.fixture.gcProduct && shift === payload.shift && lines.some((l) => x.cellText(row.getCell(4).value) === String(l.machine_code))) ours.push(n);
  });
  assert.equal(ours.length, 2, 'one row per machine line');
  for (const n of ours) assert.equal(sheet.getCell(`AA${n}`).value?.formula, `IFERROR(Z${n}/Y${n},0)`);
}));
