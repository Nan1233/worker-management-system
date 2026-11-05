'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('machine actual runtime is persisted in pending and approved machine-line tables', () => {
  const create = read('models/productionTempCreateModel.js');
  const approval = read('models/productionTempApprovalModel.js');
  const migration = read('migrations/061_persist_actual_machine_time_20261105.sql');

  assert.match(migration, /ALTER TABLE production_temp_machine_lines[\\s\\S]*ADD COLUMN IF NOT EXISTS actual_time_hours/i);
  assert.match(migration, /ALTER TABLE production_report_machine_lines[\\s\\S]*ADD COLUMN IF NOT EXISTS actual_time_hours/i);
  assert.match(create, /machine_time_hours, actual_time_hours, standard_output/i);
  assert.match(create, /Number\\(line\\.actual_time_hours \\?\\? Math\\.max/i);
  assert.match(approval, /machine_time_hours,actual_time_hours,standard_output/i);
  assert.match(approval, /line\\.actual_time_hours \\?\\? Math\\.max/i);
  assert.match(approval, /new Array\\(22\\)\\.fill/i);
});

test('history uses the persisted actual runtime instead of losing the worker-entered value', () => {
  const history = read('models/productionTempHistoryModel.js');
  assert.equal((history.match(/COALESCE\\(ml\\.actual_time_hours, ml\\.machine_time_hours - ml\\.deduction_time_hours\\)/g) || []).length, 2);
});
