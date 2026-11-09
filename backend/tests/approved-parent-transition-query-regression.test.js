'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovedParentInsertQuery(');
const end = source.indexOf('async function copyApprovedReportDetails(', start);
assert.ok(start >= 0 && end > start, 'approval parent and transition builders must exist');
const context = { buildApprovedReportInsertValues: (item, reviewerId) => [item.id, reviewerId] };
vm.runInNewContext(source.slice(start, end), context);
const parent = vm.runInNewContext('buildApprovedParentInsertQuery', context);
const transition = vm.runInNewContext('buildApprovedTempTransitionQuery', context);

test('approved parent insert retains source lineage, reviewer and snapshot columns', () => {
  const { sql, params } = parent({ id: 44 }, 7);
  assert.match(sql, /INSERT INTO production_reports\s*\(source_temp_id,worker_id,process_id/i);
  for (const column of ['standard_version_id', 'machine_standard_id', 'training_percent_snapshot', 'actual_output', 'tt_ok', 'tt_ng', 'extra_data', 'reviewed_by', 'approved_at']) {
    assert.match(sql, new RegExp('\\b' + column + '\\b'));
  }
  assert.match(sql, /NOW\(\)/);
  assert.deepEqual(Array.from(params), [44, 7]);
});

test('approval transition uses optimistic version guard and eligible statuses only', () => {
  const updated = new Date('2026-11-01T03:00:00.000Z');
  const { sql, params } = transition({ id: 51, updated_at: updated }, 8);
  assert.match(sql, /UPDATE production_reports_temp/);
  assert.match(sql, /SET status='approved'/);
  assert.match(sql, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.deepEqual(Array.from(params), [8, 51, updated]);
});

test('approval transition preserves parameter order and exact timestamp reference', () => {
  const version = '2026-11-01 10:00:00.123456';
  const item = { id: 902, updated_at: version };
  const { params } = transition(item, 101);
  assert.equal(params[0], 101);
  assert.equal(params[1], 902);
  assert.strictEqual(params[2], version);
  assert.strictEqual(item.updated_at, version);
});
