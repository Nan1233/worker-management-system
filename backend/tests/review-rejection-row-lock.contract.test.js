'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../models/productionTempApprovalModel.js'), 'utf8');
const approve = source.slice(source.indexOf('async approveSelected('), source.indexOf('async rejectSelected('));
const reject = source.slice(source.indexOf('async rejectSelected('));

test('approval and rejection both lock selected pending reports in ascending ID order', () => {
  for (const [name, body] of [['approval', approve], ['rejection', reject]]) {
    assert.match(body, /AND temp\.status IN \('pending','need_fix'\)[\s\S]*?ORDER BY temp\.id ASC\s+FOR UPDATE`/, name);
    assert.ok(body.indexOf('FOR UPDATE') < body.indexOf('if (rows.length !== reportIds.length)'), name);
    assert.ok(body.indexOf('FOR UPDATE') < body.indexOf('for (const row of rows)'), name);
  }
});

test('rejection keeps status-conditional updates and aborts entire batch on lost race', () => {
  assert.match(reject, /WHERE id=\? AND status IN \('pending','need_fix'\) AND updated_at=\?/);
  assert.match(reject, /WHERE id=\? AND status IN \('pending','need_fix'\)`/);
  assert.match(reject, /Number\(updateResult\?\.affectedRows \|\| 0\) !== 1/);
  assert.match(reject, /await rollback\(connection\)/);
  assert.match(reject, /await commit\(connection\)/);
});

test('stale rejection selections return public 409 so manager can reload', () => {
  assert.match(reject, /error\.code = "APPROVAL_SELECTION_STALE";\s*error\.isPublic = true/);
  assert.match(reject, /error\.code = "TEMP_REPORT_VERSION_CONFLICT";\s*error\.isPublic = true/);
});
