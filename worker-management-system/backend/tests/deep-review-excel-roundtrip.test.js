const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Excel-created approved report batches child detail inserts inside the report transaction', () => {
  const source = read('backend/services/approvedReportExcelCreateService.js');
  assert.match(source, /validation\.normalized\.defects\.flatMap/);
  assert.match(source, /production_report_defects\(report_id,defect_type_id,quantity\) VALUES \$\{placeholders\}/);
  assert.match(source, /validation\.normalized\.deductions\.flatMap/);
  assert.match(source, /production_report_deductions\(report_id,deduction_type_id,hours\) VALUES \$\{placeholders\}/);
  assert.match(source, /machineDefects\.flatMap/);
  assert.doesNotMatch(source, /for\s*\(const d of validation\.normalized\.defects\)\s*await conn\.query/);
});
