const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const readBackend = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const readProject = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');
const { validateProductionReport } = require('../utils/reportValidation');
const { getProcessMachinePolicy } = require('../services/processMachinePolicy');
const { getGcMachineRule } = require('../services/factoryMachineRuleService');

const localYmd = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const dayOffset = (offset) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return localYmd(d);
};

const validPayload = (workDate) => ({
  work_date: workDate,
  shift: 'A',
  total_time: 1,
  deduction_time: 0,
  actual_time: 1,
  standard_output: 1,
  actual_output: 0,
  tt_ok: 0,
  tt_ng: 0,
  defects: [],
  deductions: []
});

test('R2 backdate canonical boundary allows today through -14 and rejects -15/future', () => {
  for (const offset of [0, -1, -3, -4, -10, -14]) {
    const result = validateProductionReport(validPayload(dayOffset(offset)));
    assert.equal(result.errors.work_date, undefined, `offset ${offset} should be allowed`);
  }
  assert.match(validateProductionReport(validPayload(dayOffset(-15))).errors.work_date || '', /14 ngày/);
  assert.match(validateProductionReport(validPayload(dayOffset(1))).errors.work_date || '', /tương lai/);
});

test('R3 process machine policy keeps MAI multi and DO/EP exactly one machine', () => {
  assert.equal(getProcessMachinePolicy(2).mode, 'MULTI_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(2).maxMachines, 4);
  assert.equal(getProcessMachinePolicy(60001).mode, 'SINGLE_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(60001).maxMachines, 1);
  assert.equal(getProcessMachinePolicy(60003).mode, 'SINGLE_MACHINE_REQUIRED');
  assert.equal(getProcessMachinePolicy(60003).maxMachines, 1);
});

test('R4 GC machines 5/6/7/11 allow four workers but accounting remains a separate domain concern', () => {
  for (const code of ['5', '6', '7', '11']) {
    const rule = getGcMachineRule(code);
    assert.equal(rule.maxWorkers, 4, `machine ${code}`);
    assert.equal(rule.outputBasis, 'MACHINE', `machine ${code}`);
  }
  const service = readBackend('services/factoryMachineRuleService.js');
  assert.doesNotMatch(service, /counted_output\s*\/\s*4|actual_output\s*\/\s*4/);
});

test('R5 canonical temp lifecycle is pending -> rejected -> edit -> pending; need_fix is legacy read compatibility only', () => {
  const approval = readBackend('models/productionTempApprovalModel.js');
  const update = readBackend('models/productionTempUpdateModel.js');
  assert.match(approval, /SET status = 'rejected'/);
  assert.match(update, /status = 'pending', review_note = NULL/);
  // Legacy rows remain readable/approvable during hardening, but no mutation creates new need_fix rows.
  assert.match(approval, /status IN \('pending', 'need_fix'\)/);
  assert.doesNotMatch(`${approval}\n${update}`, /SET status\s*=\s*'need_fix'/);
});

test('R6 current Excel contract remains 10 files, xSplit=4 and date separator rows', () => {
  const monthly = readProject('desktop/electron/monthlyWorkbookLocal.cjs');
  const smoke = readProject('desktop/scripts/smokeExcel.cjs');
  assert.match(monthly, /00_TONG_HOP_SAN_XUAT_/);
  assert.match(monthly, /xSplit:\s*4/);
  assert.match(monthly, /topLeftCell:\s*['"]E6['"]/);
  assert.match(smoke, /Freeze phải dừng ở Tên NV/);
  assert.match(smoke, /hàng phân cách|hàng ngày|01\/08\/2026/i);
});

test('Wave 0 sync-job migration declares every runtime field required by syncJobModel', () => {
  const model = readBackend('models/syncJobModel.js');
  const migration = readBackend('migrations/017_integration_sync_job_runtime_contract_20260812.sql');
  const reset = readBackend('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  const fields = [
    'job_key', 'work_date', 'report_month', 'process_id', 'attempts', 'max_attempts',
    'next_retry_at', 'locked_at', 'last_error', 'completed_at', 'result_url'
  ];
  for (const field of fields) {
    assert.match(model, new RegExp(field));
    assert.match(migration, new RegExp(field));
    assert.match(reset, new RegExp(field));
  }
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_integration_jobs_type_key/);
  assert.match(migration, /status = 'pending'/);
});
