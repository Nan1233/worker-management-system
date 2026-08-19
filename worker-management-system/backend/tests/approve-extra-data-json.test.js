const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('approve-selected serializes extra_data before inserting into production_reports JSON column', () => {
  const file = path.join(__dirname, '..', 'models', 'productionTempApprovalModel.js');
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /function serializeExtraData\(value\)/);
  assert.match(source, /JSON\.stringify\(value\)/);
  assert.match(source, /serializeExtraData\(item\.extra_data\)/);
  assert.doesNotMatch(source, /item\.extra_data\s*\|\|\s*null/);
});
