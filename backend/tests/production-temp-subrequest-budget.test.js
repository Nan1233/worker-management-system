const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('temp report updates batch defect/deduction master lookups instead of querying once per item', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'productionTempUpdateModel.js'),
    'utf8'
  );

  assert.match(source, /const deductionMaster = deductionClauses\.length\s*\?/);
  assert.match(source, /const defectMaster = defectClauses\.length\s*\?/);
  assert.doesNotMatch(source, /for\s*\(const item of deductions\)\s*\{[\s\S]{0,500}?await query\(connection,\s*`SELECT id FROM deduction_types/);
  assert.doesNotMatch(source, /for\s*\(const item of defects\)\s*\{[\s\S]{0,500}?await query\(connection,\s*`SELECT id FROM defect_types/);
});

test('temp report update batches child inserts to avoid one Worker subrequest per detail row', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'models', 'productionTempUpdateModel.js'),
    'utf8'
  );

  assert.match(source, /normalizedDeductions\.map\(\(\) => "\(\?,\?,\?\)"\)/);
  assert.match(source, /normalizedDefects\.map\(\(\) => "\(\?,\?,\?\)"\)/);
  assert.doesNotMatch(source, /for\s*\(const item of normalizedDeductions\)\s*await query/);
  assert.doesNotMatch(source, /for\s*\(const item of normalizedDefects\)\s*await query/);
});
