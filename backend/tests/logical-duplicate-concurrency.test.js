const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildLogicalDuplicateKey, buildCanonicalLogicalDuplicateIdentity } = require('../services/logicalDuplicateReportService');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const base = {
  workerId: 10,
  processId: 20,
  workDate: '2026-08-13',
  shift: 'A',
  operationMode: 'MACHINE',
  machineLines: [{ machine_code: 'M5', product_code: '00123' }],
};

test('canonical key includes worker/process/work_date/shift/mode and machine-product identity', () => {
  const identity = buildCanonicalLogicalDuplicateIdentity(base);
  assert.match(identity, /w=10\|p=20\|d=2026-08-13\|s=A\|m=MACHINE/);
  assert.match(identity, /M5\u001f00123/);
  assert.equal(buildLogicalDuplicateKey(base).length, 64);
});

test('multi-machine ordering is deterministic without losing machine-product pairing', () => {
  const a = buildLogicalDuplicateKey({ ...base, machineLines: [
    { machine_code: 'M6', product_code: 'P2' },
    { machine_code: 'm5', product_code: 'P1' },
  ]});
  const b = buildLogicalDuplicateKey({ ...base, machineLines: [
    { machine_code: 'M5', product_code: 'P1' },
    { machine_code: 'M6', product_code: 'P2' },
  ]});
  const differentPairing = buildLogicalDuplicateKey({ ...base, machineLines: [
    { machine_code: 'M5', product_code: 'P2' },
    { machine_code: 'M6', product_code: 'P1' },
  ]});
  assert.equal(a, b);
  assert.notEqual(a, differentPairing);
});

test('product codes are text identity and leading zeros are preserved', () => {
  assert.notEqual(
    buildLogicalDuplicateKey(base),
    buildLogicalDuplicateKey({ ...base, machineLines: [{ machine_code: 'M5', product_code: '123' }] })
  );
});

test('different product, date, shift, worker and machine remain distinct business keys', () => {
  const original = buildLogicalDuplicateKey(base);
  const variants = [
    { ...base, machineLines: [{ machine_code: 'M5', product_code: 'P2' }] },
    { ...base, workDate: '2026-08-12' },
    { ...base, shift: 'B' },
    { ...base, workerId: 11 },
    { ...base, machineLines: [{ machine_code: 'M6', product_code: '00123' }] },
  ];
  for (const variant of variants) assert.notEqual(original, buildLogicalDuplicateKey(variant));
});

test('different workers sharing the same GC machine/event-compatible pair are allowed', () => {
  const a = buildLogicalDuplicateKey({ ...base, processId: 1, workerId: 101, machineLines: [{ machine_code: '5', product_code: 'PX' }] });
  const b = buildLogicalDuplicateKey({ ...base, processId: 1, workerId: 102, machineLines: [{ machine_code: '5', product_code: 'PX' }] });
  assert.notEqual(a, b);
});

test('manual identity uses manual sentinel and does not collapse into machine identity', () => {
  const manual = buildLogicalDuplicateKey({ ...base, operationMode: 'MANUAL', machineLines: [], machineNo: null, productName: 'PX' });
  const machine = buildLogicalDuplicateKey({ ...base, operationMode: 'MACHINE', machineLines: [], machineNo: 'M5', productName: 'PX' });
  assert.notEqual(manual, machine);
});

test('migration 024 adds lock authority without a hard report UNIQUE business key', () => {
  const sql = read('migrations/024_logical_duplicate_report_lock_20260813.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS logical_duplicate_key CHAR\(64\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS production_report_duplicate_locks/i);
  assert.match(sql, /PRIMARY KEY \(logical_key\)/i);
  assert.doesNotMatch(sql, /UNIQUE[^\n]*production_reports_temp/i);
});

test('save transaction locks logical key before duplicate precheck and insert', () => {
  const source = read('models/productionTempCreateModel.js');
  const lock = source.indexOf('await this.lockLogicalDuplicateKey');
  const similar = source.indexOf('const similar = await this.findSimilarReport', lock);
  const create = source.indexOf('const tempId = await this.create(data, connection)', similar);
  assert.ok(lock > 0 && similar > lock && create > similar);
  assert.match(source, /SELECT logical_key FROM production_report_duplicate_locks WHERE logical_key = \? FOR UPDATE/);
});

test('different client IDs are not part of logical key while request idempotency remains unique', () => {
  const migration8 = read('migrations/008_client_request_idempotency.sql');
  const source = read('services/logicalDuplicateReportService.js');
  assert.match(migration8, /UNIQUE INDEX uq_prt_worker_client_request/i);
  assert.doesNotMatch(source, /client_request_id/);
});

test('force_create still acquires lock and requires server duplicate confirmation before separate run', () => {
  const source = read('models/productionTempCreateModel.js');
  const lock = source.indexOf('await this.lockLogicalDuplicateKey');
  const similar = source.indexOf('const similar = await this.findSimilarReport', lock);
  const verify = source.indexOf('verifyDuplicateConfirmation', similar);
  assert.ok(lock > 0 && similar > lock && verify > similar);
  assert.match(source, /DUPLICATE_CONFIRMATION_REQUIRED/);
});

test('logical duplicate is translated to stable HTTP 409 and frontend preserves confirmation UX', () => {
  const controller = read('controllers/productionTempWorkerController.js');
  const frontend = fs.readFileSync(path.join(root, '..', 'frontend/src/pages/worker/ProcessPage.tsx'), 'utf8');
  assert.match(controller, /DUPLICATE_PRODUCTION_REPORT/);
  assert.match(controller, /res\.status\(409\)/);
  assert.match(frontend, /DUPLICATE_PRODUCTION_REPORT/);
  assert.match(frontend, /setDuplicatePrompt/);
});

test('blocking lifecycle covers pending/legacy need_fix and approved-active while deleted-approved is non-blocking', () => {
  const source = read('models/productionTempCreateModel.js');
  assert.match(source, /t\.status IN \('pending', 'need_fix'\)/);
  assert.match(source, /t\.status='approved'/);
  assert.match(source, /a\.source_temp_id=t\.id AND a\.status <> 'deleted'/);
});

test('scanner is read-only and reports REVIEW_REQUIRED collisions', () => {
  const source = read('scripts/auditLogicalDuplicates.js');
  assert.match(source, /REVIEW_REQUIRED/);
  assert.doesNotMatch(source, /\b(?:UPDATE|DELETE|INSERT|ALTER)\b/i);
});

test('logical-duplicate wave owns 024; later F15 remediation owns 025', () => {
  const migrations = fs.readdirSync(path.join(root, 'migrations'));
  assert.ok(migrations.some((x) => x.startsWith('024_')));
  assert.ok(migrations.includes('025_formula_settings_effective_range_20260813.sql'));
});

test('Excel approved-create uses the same DB logical-key lock before approved duplicate check/insert', () => {
  const source = read('services/approvedReportExcelCreateService.js');
  const key = source.indexOf('buildLogicalDuplicateKey');
  const lock = source.indexOf('production_report_duplicate_locks', key);
  const dup = source.indexOf('SELECT id FROM production_reports', lock);
  const insert = source.indexOf('INSERT INTO production_reports', dup);
  assert.ok(key >= 0 && lock > key && dup > lock && insert > dup);
  assert.match(source, /DUPLICATE_PRODUCTION_REPORT/);
  assert.match(source, /status <> 'deleted'/);
});
