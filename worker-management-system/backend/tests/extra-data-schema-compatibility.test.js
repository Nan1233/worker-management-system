const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'services', 'processExcelExportService.js'), 'utf8');
test('Excel export tolerates production_reports without entry_date and extra_data', () => {
  assert.match(source, /hasColumn\('production_reports', 'entry_date'\)/);
  assert.match(source, /hasColumn\('production_reports', 'extra_data'\)/);
  assert.match(source, /NULL AS extra_data/);
  assert.match(source, /LOWER\(TRIM\(COALESCE\(pr\.status, ''\)\)\) = 'approved'/);
});
