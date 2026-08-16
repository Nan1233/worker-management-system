process.env.JWT_SECRET = process.env.JWT_SECRET || 'data-integrity-closeout-test-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildLogicalDuplicateKey } = require('../services/logicalDuplicateReportService');
const { issueDuplicateConfirmation, verifyDuplicateConfirmation } = require('../services/duplicateConfirmationService');

const root = path.join(__dirname, '..');
const repo = path.join(root, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readRepo = (p) => fs.readFileSync(path.join(repo, p), 'utf8');
const key = 'a'.repeat(64);

function token(overrides = {}, now = Date.now()) {
  return issueDuplicateConfirmation({
    workerId: 101,
    logicalDuplicateKey: key,
    existingReportId: 55,
    existingReportType: 'temp',
    ttlSeconds: 300,
    now,
    ...overrides,
  });
}

test('duplicate challenge validates only matching worker/key/report/type context', () => {
  const value = token();
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 101, logicalDuplicateKey: key, existingReportId: 55, existingReportType: 'temp' }).valid, true);
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 102, logicalDuplicateKey: key, existingReportId: 55, existingReportType: 'temp' }).valid, false);
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 101, logicalDuplicateKey: 'b'.repeat(64), existingReportId: 55, existingReportType: 'temp' }).valid, false);
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 101, logicalDuplicateKey: key, existingReportId: 56, existingReportType: 'temp' }).valid, false);
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 101, logicalDuplicateKey: key, existingReportId: 55, existingReportType: 'approved' }).valid, false);
});

test('duplicate challenge is short-lived and tamper resistant', () => {
  const now = Date.now();
  const value = token({}, now);
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 101, logicalDuplicateKey: key, existingReportId: 55, existingReportType: 'temp' }, now + 299_000).valid, true);
  assert.equal(verifyDuplicateConfirmation(value, { workerId: 101, logicalDuplicateKey: key, existingReportId: 55, existingReportType: 'temp' }, now + 301_000).valid, false);
  const tampered = `${value.slice(0, -1)}${value.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(verifyDuplicateConfirmation(tampered, { workerId: 101, logicalDuplicateKey: key, existingReportId: 55, existingReportType: 'temp' }).valid, false);
});

test('worker route is role-restricted and force flag is never standalone authority', () => {
  const route = read('routes/productionTempRoutes.js');
  const model = read('models/productionTempCreateModel.js');
  assert.match(route, /checkRole\("worker"\)/);
  assert.match(model, /verifyDuplicateConfirmation\(data\.duplicate_confirmation_token/);
  assert.match(model, /DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.doesNotMatch(model, /if\s*\(data\.force_create\)\s*\{?\s*(?:continue|return|await this\.create)/);
});

test('frontend can only send force_create from duplicate-confirmation handler and includes server challenge', () => {
  const page = readRepo('frontend/src/pages/worker/ProcessPage.tsx');
  const forceRefs = [...page.matchAll(/force_create:\s*true/g)];
  assert.equal(forceRefs.length, 1);
  assert.match(page, /duplicate_confirmation_token:\s*duplicatePrompt\.confirmationToken/);
  assert.match(page, /duplicateResponse\.data\?\.duplicate_confirmation_token/);
});

test('approved collision does not expose worker edit-existing action', () => {
  const page = readRepo('frontend/src/pages/worker/ProcessPage.tsx');
  const actions = readRepo('frontend/src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.match(page, /reportType:\s*duplicateResponse\.data\?\.report_type === "approved"/);
  assert.match(page, /canUpdateExisting=\{duplicatePrompt\?\.reportType !== "approved"\}/);
  assert.match(actions, /canUpdateExisting && <button[^>]+duplicate-dialog-edit/);
});

test('worker duplicate lifecycle blocks pending and approved-active but not rejected or deleted-approved', () => {
  const model = read('models/productionTempCreateModel.js');
  assert.match(model, /t\.status IN \('pending', 'need_fix'\)/);
  assert.match(model, /t\.status='approved' AND EXISTS/);
  assert.match(model, /a\.source_temp_id=t\.id AND a\.status <> 'deleted'/);
  assert.doesNotMatch(model, /t\.status IN \('pending', 'rejected'/);
});

test('direct approved rows including Excel-created reports participate in worker duplicate detection', () => {
  const model = read('models/productionTempCreateModel.js');
  assert.match(model, /FROM production_reports\s+WHERE worker_id=\? AND process_id=\? AND work_date=\? AND shift=\? AND status <> 'deleted'/s);
  assert.match(model, /FROM production_report_machine_lines/);
  assert.match(model, /buildLogicalDuplicateKey\(/);
});

test('soft-deleted approved reports are non-blocking in worker and Excel create paths', () => {
  const model = read('models/productionTempCreateModel.js');
  const excel = read('services/approvedReportExcelCreateService.js');
  assert.match(model, /status <> 'deleted'/);
  assert.match(excel, /status <> 'deleted'/);
});

test('rejected worker edit resubmits same row to pending without creating need_fix workflow', () => {
  const update = read('models/productionTempUpdateModel.js');
  assert.match(update, /current\.status === "rejected"/);
  assert.match(update, /status = 'pending', review_note = NULL/);
  assert.doesNotMatch(update, /SET status\s*=\s*'need_fix'/);
});

test('need_fix remains legacy compatibility only with no active transition creation', () => {
  const files = [
    read('models/productionTempApprovalModel.js'),
    read('models/productionTempUpdateModel.js'),
    read('controllers/productionTempManagementController.js'),
  ].join('\n');
  assert.doesNotMatch(files, /SET status\s*=\s*'need_fix'/);
  assert.match(read('models/productionTempReadModel.js'), /need_fix/);
});

test('logical lock creation converges on one persistent SHA-256 key authority', () => {
  const model = read('models/productionTempCreateModel.js');
  const migration = read('migrations/024_logical_duplicate_report_lock_20260813.sql');
  assert.match(model, /INSERT INTO production_report_duplicate_locks[\s\S]*ON DUPLICATE KEY UPDATE/);
  assert.match(model, /SELECT logical_key FROM production_report_duplicate_locks WHERE logical_key = \? FOR UPDATE/);
  assert.match(migration, /logical_key CHAR\(64\) NOT NULL/);
  assert.match(migration, /PRIMARY KEY \(logical_key\)/);
});

test('logical lock and duplicate decision run on the same save transaction connection', () => {
  const model = read('models/productionTempCreateModel.js');
  assert.match(model, /lockLogicalDuplicateKey\(data\.logical_duplicate_key, connection\)/);
  assert.match(model, /findSimilarReport\([\s\S]*\}, connection\)/);
  assert.match(model, /this\.create\(data, connection\)/);
});

test('multi-machine key sorts machine-product pairs and preserves product leading zeros', () => {
  const base = { workerId: 1, processId: 2, workDate: '2026-08-13', shift: 'A', operationMode: 'MACHINE' };
  const a = buildLogicalDuplicateKey({ ...base, machineLines: [{ machine_code: 'M5', product_code: '00123' }, { machine_code: 'M6', product_code: 'P2' }] });
  const reversed = buildLogicalDuplicateKey({ ...base, machineLines: [{ machine_code: 'M6', product_code: 'P2' }, { machine_code: 'M5', product_code: '00123' }] });
  const swapped = buildLogicalDuplicateKey({ ...base, machineLines: [{ machine_code: 'M5', product_code: 'P2' }, { machine_code: 'M6', product_code: '00123' }] });
  const noLeadingZero = buildLogicalDuplicateKey({ ...base, machineLines: [{ machine_code: 'M5', product_code: '123' }, { machine_code: 'M6', product_code: 'P2' }] });
  assert.equal(a, reversed);
  assert.notEqual(a, swapped);
  assert.notEqual(a, noLeadingZero);
});

test('client_request_id and machine_event_id are not logical duplicate identity authority', () => {
  const source = read('services/logicalDuplicateReportService.js');
  assert.doesNotMatch(source, /client_request_id/);
  assert.doesNotMatch(source, /machine_event_id/);
});

test('Excel approved-create locks the canonical key and blocks active approved duplicates', () => {
  const excel = read('services/approvedReportExcelCreateService.js');
  const lock = excel.indexOf('production_report_duplicate_locks');
  const dup = excel.indexOf('SELECT id FROM production_reports', lock);
  const insert = excel.indexOf('INSERT INTO production_reports', dup);
  assert.ok(lock >= 0 && dup > lock && insert > dup);
  assert.match(excel, /DUPLICATE_PRODUCTION_REPORT/);
});

test('logical duplicate scanner is read-only and does not claim to know separate-run intent', () => {
  const scanner = read('scripts/auditLogicalDuplicates.js');
  assert.doesNotMatch(scanner, /\b(?:UPDATE|DELETE|INSERT|ALTER)\b/i);
  assert.match(scanner, /REVIEW_REQUIRED/);
  assert.doesNotMatch(scanner, /CORRUPT|AUTO_REPAIR|intentional/i);
});

test('F07 web edit still requires expected_updated_at at normal approved endpoint', () => {
  const controller = read('controllers/productionController.js');
  assert.match(controller, /REPORT_VERSION_TOKEN_REQUIRED/);
  assert.match(controller, /expectedUpdatedAt[,\s]/);
});

test('F12 authoritative standard validation remains fail-closed', () => {
  const validation = read('services/masterNumericValidationService.js');
  assert.match(validation, /MASTER_NUMERIC_REQUIRED/);
  assert.match(validation, /MASTER_NUMERIC_INVALID/);
  assert.match(validation, /MASTER_NUMERIC_OUT_OF_RANGE/);
});

test('data-integrity migration 024 remains immutable while later F15 remediation may add 025', () => {
  const migrations = fs.readdirSync(path.join(root, 'migrations'));
  assert.ok(migrations.includes('024_logical_duplicate_report_lock_20260813.sql'));
  assert.ok(migrations.includes('025_formula_settings_effective_range_20260813.sql'));
});

test('migration order 017 through 024 is contiguous and 024 follows 023', () => {
  const migrations = fs.readdirSync(path.join(root, 'migrations')).filter((name) => /^(017|018|019|020|021|022|023|024)_/.test(name)).sort();
  assert.deepEqual(migrations.map((name) => name.slice(0, 3)), ['017','018','019','020','021','022','023','024']);
  assert.match(migrations[migrations.length - 1], /^024_logical_duplicate_report_lock_20260813\.sql$/);
});

test('reset schema is synchronized with migration 024 lock structures', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  assert.match(reset, /logical_duplicate_key CHAR\(64\) NULL/);
  assert.match(reset, /CREATE TABLE IF NOT EXISTS production_report_duplicate_locks/);
  assert.match(reset, /PRIMARY KEY \(logical_key\)/);
});
