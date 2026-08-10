const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateEnvironment } = require('../config/validateEnvironment');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('production environment validation fails closed when critical secrets are missing', () => {
  assert.throws(
    () => validateEnvironment({ NODE_ENV: 'production', DB_HOST: 'h' }, { production: true }),
    (error) => error?.code === 'ENVIRONMENT_VALIDATION_FAILED'
      && error.missing.includes('JWT_SECRET')
      && error.missing.includes('DB_PASSWORD'),
  );
  assert.doesNotThrow(() => validateEnvironment({
    NODE_ENV: 'production',
    DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd', JWT_SECRET: 'secret',
  }, { production: true }));
});

test('Google sync requires its credentials only when enabled', () => {
  assert.throws(() => validateEnvironment({
    NODE_ENV: 'production', DB_HOST: 'h', DB_USER: 'u', DB_PASSWORD: 'p', DB_NAME: 'd', JWT_SECRET: 's',
    ENABLE_GOOGLE_SHEET_SYNC: 'true',
  }, { production: true }), /GOOGLE_SERVICE_ACCOUNT/);
});

test('approved report mutation is blocked by reporting-period governance and requires a reason', () => {
  const controller = read('controllers/productionController.js');
  const editService = read('services/approvedReportEditService.js');
  assert.match(editService, /ReportGovernanceService\.isPeriodLocked\(before\.work_date, before\.process_id, connection\)/);
  assert.match(controller, /ReportGovernanceService\.isPeriodLocked\(snapshot\.work_date, snapshot\.process_id, connection\)/);
  assert.match(editService, /ReportGovernanceService\.isPeriodLocked\(validation\.normalized\.work_date, before\.process_id, connection\)/);
  assert.match(editService, /REPORTING_PERIOD_LOCKED/);
  assert.match(editService, /CHANGE_REASON_REQUIRED/);
  assert.match(controller, /DELETE_REASON_REQUIRED/);
  assert.equal((controller.match(/exports\.updateReport\s*=/g) || []).length, 1);
  assert.equal((controller.match(/exports\.deleteReport\s*=/g) || []).length, 1);
});

test('client request idempotency is protected by a unique database index', () => {
  const indexes = read('scripts/ensureIndexes.js');
  const migration = read('migrations/008_client_request_idempotency.sql');
  assert.match(indexes, /uq_prt_worker_client_request/);
  assert.match(indexes, /unique:\s*true/);
  assert.match(migration, /CREATE UNIQUE INDEX uq_prt_worker_client_request/);
});

test('process Excel export does not mutate process-global output environment variables', () => {
  const processExport = read('services/processExcelExportService.js');
  const consolidated = read('services/consolidatedExcelExportService.js');
  assert.doesNotMatch(processExport, /process\.env\.EXCEL_EXPORT_ROOT\s*=/);
  assert.doesNotMatch(processExport, /process\.env\.EXCEL_STAGE_FOLDER_NAME\s*=/);
  assert.match(processExport, /exportRoot:\s*tempRoot/);
  assert.match(processExport, /stageFolder:\s*path\.join\(processFolder, month\)/);
  assert.match(consolidated, /getMonthlyTarget = \(yearMonth, options = \{\}\)/);
});

test('desktop prevents concurrent application instances', () => {
  const desktop = read('../desktop/electron/main.cjs');
  assert.match(desktop, /app\.requestSingleInstanceLock\(\)/);
  assert.match(desktop, /SECOND_INSTANCE_BLOCKED/);
  assert.match(desktop, /setPermissionRequestHandler/);
});

test('production detail rows are protected against duplicate defect/deduction types', () => {
  const migration = read('migrations/016_integrity_constraints_20260810.sql');
  const runner = read('scripts/runMigrations.js');
  assert.match(migration, /uq_temp_defect_once/);
  assert.match(migration, /uq_report_defect_once/);
  assert.match(migration, /uq_temp_deduction_once/);
  assert.match(migration, /uq_report_deduction_once/);
  assert.match(runner, /normalizeProductionDetailDuplicates/);
});

test('approval and rejection notifications are post-commit best-effort side effects', () => {
  const approval = read('models/productionTempApprovalModel.js');
  const approveCommit = approval.indexOf('await commit(connection);');
  const firstNotify = approval.indexOf('await AuditService.notifyUsers(notification.userIds, notification.payload)');
  assert.ok(approveCommit >= 0 && firstNotify > approveCommit);
  assert.match(approval, /Post-commit approval notification failed/);
  assert.match(approval, /Post-commit rejection notification failed/);
});

test('database integrity command covers orphan and invalid production rows', () => {
  const script = read('scripts/checkDatabaseIntegrity.js');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['db:integrity'], 'node scripts/checkDatabaseIntegrity.js');
  assert.match(script, /TEMP_REPORT_WORKER_ORPHAN/);
  assert.match(script, /APPROVED_SOURCE_TEMP_ORPHAN/);
  assert.match(script, /INVALID_TRAINING_PERCENT/);
  assert.match(script, /DATABASE_INTEGRITY_FAILED/);
});

test('API hardening maps CORS, malformed JSON and large payloads to public client errors', () => {
  const server = read('server.js');
  assert.match(server, /CORS_ORIGIN_DENIED/);
  assert.match(server, /PAYLOAD_TOO_LARGE/);
  assert.match(server, /INVALID_JSON/);
  assert.match(server, /\^\[A-Za-z0-9\._:-\]\{1,120\}\$/);
  assert.match(server, /closeAllConnections/);
});

test('backend exposes a production-only dependency audit command', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['audit:prod'], 'npm audit --omit=dev --audit-level=high');
});

test('desktop package uses compressed release artifacts', () => {
  const pkg = JSON.parse(read('../desktop/package.json'));
  assert.equal(pkg.build.compression, 'maximum');
});

test('temp create/update aggregate duplicate defect and deduction types before unique inserts', () => {
  const createModel = read('models/productionTempCreateModel.js');
  const updateModel = read('models/productionTempUpdateModel.js');
  assert.match(createModel, /const defectTotals = new Map\(\)/);
  assert.match(createModel, /const deductionTotals = new Map\(\)/);
  assert.match(updateModel, /const deductionTotalsByType = new Map\(\)/);
  assert.match(updateModel, /const defectTotalsByType = new Map\(\)/);
});
