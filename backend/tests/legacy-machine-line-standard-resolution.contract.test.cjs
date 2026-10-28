const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy machine-line backfill resolves standard from machine master, product, and work date instead of copying parent snapshot', () => {
  const file = path.join(__dirname, '..', 'models', 'productionTempReviewModel.js');
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /createStandardResolver/);
  assert.match(source, /resolver\.resolveStandard\(\{/);
  assert.match(source, /machineId:\s*Number\(machine\.id\)/);
  assert.match(source, /machineCode:\s*machine\.machine_code/);
  assert.match(source, /workDate:\s*report\.work_date/);
  assert.match(source, /workType:\s*null/);
  assert.match(source, /machine master is the source of truth for Cắt\/Lồng/i);
  assert.match(source, /resolved\.standardOutput/);
  assert.match(source, /resolved\.productStandardId/);
  assert.match(source, /resolved\.machineStandardId/);
});

test('legacy machine-line backfill does not trust imported operation_type over machine master', () => {
  const file = path.join(__dirname, '..', 'models', 'productionTempReviewModel.js');
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /Imported legacy operation_type can be wrong/);
  assert.match(source, /workType:\s*null/);
  assert.match(source, /LEGACY_MACHINE_LINE_REQUIRES_REVIEW/);
});
