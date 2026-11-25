'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '../src/pages/manager/approvedReportsPresentation.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: sourcePath,
});
const mod = { exports: {} };
new Function('module', 'exports', outputText)(mod, mod.exports);
const p = mod.exports;

test('approved report codes preserve machine/product precedence and de-duplicate', () => {
  const report = {
    machine_lines: [
      { machine_code: 'C100', product_code: 'P01' },
      { machine_code: 'C100', product_code: 'P02' },
      { machine_code: 'C200', product_code: 'P01' },
    ],
    machine_no: 'C200',
    product_name: 'P02',
  };
  assert.equal(p.reportCodes(report, 'machine'), 'C100, C200');
  assert.equal(p.reportCodes(report, 'product'), 'P01, P02');
  assert.equal(p.reportCodes({ machine_lines: [] }, 'product'), '—');
});

test('approved KPI keeps stored snapshots ahead of machine fallbacks', () => {
  const report = {
    tt_ok: 90,
    tt_ng: 10,
    actual_output: 100,
    actual_time: 4,
    total_time: 5,
    standard_output: 80,
    tt_dinh_muc: 500,
    nang_suat_percent: 75,
    training_percent: 99,
    training_percent_snapshot: 87.5,
    ok_rate_percent: 90,
    pp_percent: 10,
    ng_defect_type_count: 2,
    machine_lines: [
      { machine_time_hours: 3, deduction_time_hours: 1, standard_output: 80 },
      { machine_time_hours: 2, deduction_time_hours: 0.5, standard_output: 100 },
    ],
  };
  assert.deepEqual(p.kpi(report), {
    ok: 90, ng: 10, actual: 100, actualTime: 4, totalTime: 5,
    ttDinhMuc: 500, nangSuat: 75, dat: 90, pp: 10, hv: 87.5,
    ngTypeCount: 2,
  });
  const fallback = { ...report, tt_dinh_muc: 0, nang_suat_percent: 0, actual_time: 0, total_time: 0 };
  const actual = p.kpi(fallback);
  assert.equal(actual.actualTime, 0, 'explicit zero is not missing');
  assert.equal(actual.totalTime, 0);
  assert.equal(actual.ttDinhMuc, 0);
  assert.equal(actual.nangSuat, 0);
  const canonical = p.kpi({...report, kpi:{ok:90,allNg:10,adjustedOutput:100,actualTime:3.5,workingTime:5,plannedOutput:310,achievement:100/310,okRate:0.9,ngRate:0.1,trainingPercent:50}});
  assert.equal(canonical.actualTime,3.5);
  assert.equal(canonical.hv,50);
  assert.equal(canonical.ttDinhMuc,310);
  assert.equal(p.kpi({...report, training_percent_snapshot:null}).hv,null);
});

test('date ranges and warning highlighting preserve existing UI rules', () => {
  assert.deepEqual(p.rangeFor('2026-11-20', 'week'), { dateFrom: '2026-11-16', dateTo: '2026-11-22' });
  assert.deepEqual(p.rangeFor('2026-11-20', 'month'), { dateFrom: '2026-11-01', dateTo: '2026-11-30' });
  assert.deepEqual(p.rangeFor('2026-11-20', 'year'), { dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  assert.equal(p.dateText('2026-11-20'), '20/11/2026');
  assert.equal(p.pct(12.5), '12,5%');
  assert.deepEqual(p.metricStyle('productivity', 75), { backgroundColor: '#ffd6e7', color: '#9b123f', fontWeight: 800, border: '1px solid #ff9fbe' });
  assert.deepEqual(p.metricStyle('productivity', 90), {});
});

test('machine NG parser accepts array JSON and object-form defects_json', () => {
  const actual = p.parseMachineDefects({
    machine_lines: [
      { machine_code: 'M1', defects_json: JSON.stringify([{ defect_name: 'Rách', quantity: 2 }]) },
      { machine_code: 'M2', defects_json: JSON.stringify({ 'Bavia': 3, selectedNg: true, total: 3 }) },
      { machine_code: 'M3', defects: 'corrupt-json' },
    ],
  });
  assert.deepEqual(actual, [
    { name: 'Rách', quantity: 2, machine: 'M1' },
    { name: 'Bavia', quantity: 3, machine: 'M2' },
  ]);
  // Preserve legacy behavior: when defects is not an array the parser
  // falls back to defects_json (an object in defects alone is not read).
  assert.deepEqual(p.parseMachineDefects({
    machine_lines: [{ machine_code: 'M4', defects: { Bavia: 5 } }],
  }), []);
});
