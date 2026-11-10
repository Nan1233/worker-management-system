'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const start = source.indexOf('function buildApprovalScopeQuery(');
const end = source.indexOf('function buildTempMachineLineDefectsQuery(', start);
assert.ok(start >= 0 && end > start, 'approval and rejection scope query builders must exist');
const ctx = {};
vm.runInNewContext(source.slice(start, end), ctx);
const approval = vm.runInNewContext('buildApprovalScopeQuery', ctx);
const rejection = vm.runInNewContext('buildRejectionScopeQuery', ctx);

for (const [name, builder] of [['approval', approval], ['rejection', rejection]]) {
  test(name + ' manager query restricts process scope, eligible statuses, and locks rows', () => {
    const { sql, params } = builder([31, 32], 9, false);
    assert.match(sql, /manager_processes mp ON mp\.process_id\s*=\s*temp\.process_id/i);
    assert.match(sql, /AND mp\.manager_id\s*=\s*\?/i);
    assert.match(sql, /temp\.id IN \(\?,\?\)/);
    assert.match(sql, /temp\.status IN \('pending','need_fix'\)/);
    assert.match(sql, /ORDER BY temp\.id ASC\s+FOR UPDATE/i);
    assert.match(sql, /SELECT DISTINCT/i);
    assert.deepEqual(Array.from(params), [31, 32, 9]);
  });

  test(name + ' admin query does not require manager mapping and retains row locks', () => {
    const { sql, params } = builder([81, 82, 83], 9, true);
    assert.doesNotMatch(sql, /manager_processes|mp\.manager_id/i);
    assert.match(sql, /temp\.id IN \(\?,\?,\?\)/);
    assert.match(sql, /temp\.status IN \('pending','need_fix'\)/);
    assert.match(sql, /ORDER BY temp\.id ASC\s+FOR UPDATE/i);
    assert.deepEqual(Array.from(params), [81, 82, 83]);
  });
}
