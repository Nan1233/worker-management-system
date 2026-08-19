const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const file = path.join(__dirname, '..', 'models', 'productionTempApprovalModel.js');
const source = fs.readFileSync(file, 'utf8');

test('bulk approval returns a 409 stale-selection contract instead of a generic 400', () => {
  assert.match(source, /error\.status\s*=\s*409/);
  assert.match(source, /error\.code\s*=\s*"APPROVAL_SELECTION_STALE"/);
  assert.match(source, /missing_ids:\s*missingIds/);
});
