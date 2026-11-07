const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const extraFields = fs.readFileSync(path.join(root, 'frontend/src/pages/worker/processExtraFields.ts'), 'utf8');
const exportService = fs.readFileSync(path.join(root, 'backend/services/companyMaiDoExcelService.js'), 'utf8');
const payload = fs.readFileSync(path.join(root, 'frontend/src/pages/worker/processReportSubmission.ts'), 'utf8');

test('Đo hides related grinding machine from worker form while preserving legacy extra_data compatibility', () => {
  assert.match(extraFields, /do:\s*\[\s*\]/);
  assert.match(payload, /extra_data:\s*\{\.\.\.args\.extraData/);
});

test('Mài export writes the per-machine standard grinding seconds to template column F', () => {
  assert.match(exportService, /const inputColumns = \[2, 4, 5, 6, 8, 9,/);
  assert.match(exportService, /setInputCell\(row, 6, toNumber\(machineLine\?\.standard_time_seconds \?\? report\.standard_time_seconds\)\)/);
});

test('Đo export writes related grinding machine to template column F and clears it before rebuild', () => {
  assert.match(exportService, /const inputColumns = \[2, 4, 5, 6, 7, 8,/);
  assert.match(exportService, /setInputCell\(row, 6, extraDataValue\(report, 'grinding_machine_no'\)\)/);
  assert.match(exportService, /const extraDataValue = \(report, key\)/);
});
