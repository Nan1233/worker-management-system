const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('supported backend standard surfaces do not integer-round production standards', () => {
  const files = [
    'utils/reportValidation.js',
    'controllers/adminMasterController.js',
    'controllers/formulaSettingsController.js',
    'services/companyExcelExportService.js',
    'services/consolidatedExcelExportService.js',
    'services/googleSheetService.js'
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /Math\.round\([^\n]*(?:standard_output|standardOutput)/i, `${file} must not round standards`);
    assert.doesNotMatch(source, /CAST\(ROUND\([^\n]*standard_output/i, `${file} must not SQL-round standards`);
  }
});

test('declared standard persistence columns retain DECIMAL(18,6) and require no decimal migration', () => {
  const master = read('migrations/001_core_master_schema.sql');
  const production = read('migrations/002_production_schema.sql');
  const machine = read('migrations/003_machine_and_session_schema.sql');
  assert.match(master, /standard_output DECIMAL\(18,6\)/);
  assert.match(production, /standard_output DECIMAL\(18,6\)/);
  assert.match(machine, /standard_output DECIMAL\(18,6\)/);
  assert.match(master, /calculated_output_per_hour DECIMAL\(18,6\)/);
});

test('historical scanner explicitly detects decimal rounding candidates and remains read-only', () => {
  const scanner = read('scripts/auditHistoricalStandards.js');
  assert.match(scanner, /DECIMAL_ROUNDING_CANDIDATE/);
  assert.doesNotMatch(scanner, /\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
});
