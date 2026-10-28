const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('legacy machine-line backfill resolves standard from machine/product/date instead of copying parent snapshot', () => {
  const file = path.join(__dirname, '..', 'models', 'productionTempReviewModel.js');
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /createStandardResolver/);
  assert.match(source, /resolver\.resolveStandard\(\{/);
  assert.match(source, /machineId:\s*Number\(machine\.id\)/);
  assert.match(source, /machineCode:\s*machine\.machine_code/);
  assert.match(source, /workDate:\s*report\.work_date/);
  assert.match(source, /explicitGcWorkType\(/);
  assert.match(source, /resolved\.standardOutput/);
  assert.match(source, /resolved\.productStandardId/);
  assert.match(source, /resolved\.machineStandardId/);
});

test('legacy machine-line backfill fails closed when machine work type and report operation conflict', () => {
  const file = path.join(__dirname, '..', 'models', 'productionTempReviewModel.js');
  const source = fs.readFileSync(file, 'utf8');

  assert.match(source, /GC_WORK_TYPE_MISMATCH/);
  assert.match(source, /LEGACY_MACHINE_LINE_REQUIRES_REVIEW/);
  assert.match(source, /Cần sửa dữ liệu nguồn trước khi duyệt/);
});
