'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const file = path.join(__dirname, '../src/pages/manager/managerReportsPresentation.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded._compile(js, file);
const { kpi, rangeFor, processLabel, getStoredExtraData, metricStyle } = loaded.exports;

test('pending KPI honors persisted standard/productivity/training snapshots', () => {
  const result = kpi({
    tt_ok: 90, tt_ng: 10, actual_output: 100,
    tt_dinh_muc_snapshot: 200, nang_suat_percent_snapshot: 50,
    training_percent_snapshot: 75, ng_defect_type_count: 2,
  });
  assert.equal(result.ttDinhMuc, 200);
  assert.equal(result.nangSuat, 50);
  assert.equal(result.hv, 75);
  assert.equal(result.dat, 90);
  assert.equal(result.ngTypeCount, 2);
});

test('machine-line fallback uses net hours and does not invent a missing standard', () => {
  const machine = kpi({
    actual_output: 50, tt_ok: 48, tt_ng: 2,
    machine_lines: [{ machine_time_hours: 4, deduction_time_hours: 1, standard_output: 20 }],
  });
  assert.equal(machine.ttDinhMuc, 60);
  assert.ok(Math.abs(machine.nangSuat - 50 / 60 * 100) < 0.00001);

  const missing = kpi({ tt_ok: 10, tt_ng: 1, actual_output: 11, standard_missing_lines: 1 });
  assert.equal(missing.ttDinhMuc, 0);
  assert.equal(missing.nangSuat, 0);
  assert.equal(missing.standardMissing, true);
});

test('date filter preserves Monday-Sunday weeks across year boundary', () => {
  assert.deepEqual(rangeFor('2026-01-01', 'week'), { dateFrom: '2025-12-29', dateTo: '2026-01-04' });
  assert.deepEqual(rangeFor('2026-11-10', 'month'), { dateFrom: '2026-11-01', dateTo: '2026-11-30' });
});

test('non-product work label and metric colors keep existing display behavior', () => {
  const report = {
    process_name: 'Gia công',
    extra_data: JSON.stringify({ non_product_work: true, work_type: '5S' }),
  };
  assert.equal(processLabel(report), 'Gia công · Công việc khác (5S)');
  assert.deepEqual(getStoredExtraData('{invalid'), {});
  assert.equal(metricStyle('productivity', 70).fontWeight, 800);
  assert.deepEqual(metricStyle('productivity', 90), {});
});
