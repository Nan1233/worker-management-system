const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const readBackend = (relative) => fs.readFileSync(path.join(backendRoot, relative), 'utf8');
const readProject = (relative) => fs.readFileSync(path.join(projectRoot, relative), 'utf8');

test('F07 controller requires expected_updated_at for normal approved web edit and passes it to canonical service', () => {
  const source = readBackend('controllers/productionController.js');
  const start = source.indexOf('exports.updateReport = async');
  const end = source.indexOf('exports.deleteReport = async', start);
  const block = source.slice(start, end);
  assert.match(block, /const expectedUpdatedAt = body\.expected_updated_at/);
  assert.match(block, /REPORT_VERSION_TOKEN_REQUIRED/);
  assert.match(block, /status\(428\)/);
  assert.match(block, /expectedUpdatedAt,/);
  assert.match(block, /source: 'web'/);
  assert.match(block, /const \{ expected_updated_at: _expectedUpdatedAt, \.\.\.patch \} = body/);
});

test('F07 canonical service checks stale token after row lock and before versions or mutation', () => {
  const source = readBackend('services/approvedReportEditService.js');
  const start = source.indexOf('async function updateApprovedReport');
  const end = source.indexOf('async function restoreApprovedReportVersion', start);
  const block = source.slice(start, end);
  const lock = block.indexOf('FOR UPDATE');
  const conflict = block.indexOf('REPORT_VERSION_CONFLICT');
  const preVersion = block.indexOf('createApprovedReportVersion');
  const update = block.indexOf('UPDATE production_reports');
  assert.ok(lock >= 0, 'approved report must be locked');
  assert.ok(conflict > lock, 'stale token must be checked after row lock');
  assert.ok(preVersion > conflict, 'no pre-version may be appended before stale conflict check');
  assert.ok(update > conflict, 'no parent mutation may occur before stale conflict check');
});

test('F07 stale expected_updated_at rejects with zero write/version/audit side effects', async () => {
  const originalLoad = Module._load;
  const writes = [];
  let rolledBack = false;
  let committed = false;
  let released = false;
  const row = {
    id: 9,
    process_id: 2,
    worker_id: 5,
    updated_at: '2026-08-13T00:00:02.000Z',
    created_at: '2026-08-13T00:00:00.000Z'
  };
  const fakeConnection = {
    beginTransaction: async () => {},
    commit: async () => { committed = true; },
    rollback: async () => { rolledBack = true; },
    release: () => { released = true; },
    query: async (sql) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/SELECT \* FROM production_reports WHERE id=\? FOR UPDATE/i.test(normalized)) return [[row], []];
      if (/SELECT \* FROM production_reports WHERE id=\? LIMIT 1/i.test(normalized)) return [[row], []];
      if (/SELECT \* FROM production_report_defects/i.test(normalized)) return [[], []];
      if (/SELECT \* FROM production_report_deductions/i.test(normalized)) return [[], []];
      if (/^(UPDATE|INSERT|DELETE)/i.test(normalized)) writes.push(normalized);
      return [[], []];
    }
  };
  const fakeDb = { promise: () => ({ getConnection: async () => fakeConnection }) };
  const stubs = {
    '../config/db': fakeDb,
    './auditService': {},
    '../utils/reportValidation': { validateProductionReport: () => ({ valid: true, normalized: {} }) },
    './reportBusinessValidationService': { validateMasterData: async () => ({ valid: true }) },
    './reportGovernanceService': { isPeriodLocked: async () => false },
    './kqdReportCalculationService': { recalculateReportOutput: () => ({}) },
    './processAuthorizationService': { assertProcessScope: async () => true },
    './approvedVersionSnapshotService': {
      createApprovedReportVersion: async () => { writes.push('VERSION_APPEND'); },
      parseSnapshotJson: () => ({}),
      loadApprovedAggregateSnapshot: async () => ({}),
      validateApprovedVersionSnapshot: () => ({ valid: true }),
      assertApprovedVersionSnapshotSafe: () => true,
      approvedSnapshotsEqual: () => true,
      REPORT_FIELDS: [],
      MACHINE_LINE_FIELDS: []
    }
  };
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  const servicePath = path.join(backendRoot, 'services/approvedReportEditService.js');
  delete require.cache[require.resolve(servicePath)];
  try {
    const { updateApprovedReport } = require(servicePath);
    await assert.rejects(
      () => updateApprovedReport({
        reportId: 9,
        patch: { note: 'stale edit' },
        reason: 'test',
        userId: 77,
        actor: { id: 77, role: 'admin' },
        expectedUpdatedAt: '2026-08-13T00:00:00.000Z',
        source: 'web'
      }),
      (error) => error?.code === 'REPORT_VERSION_CONFLICT' && error?.status === 409
    );
    assert.deepEqual(writes, [], 'stale edit must not mutate parent/children or append versions');
    assert.equal(committed, false);
    assert.equal(rolledBack, true);
    assert.equal(released, true);
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(servicePath)];
  }
});


test('F07 matching expected_updated_at succeeds and returns a fresh updated_at baseline', async () => {
  const originalLoad = Module._load;
  let currentRow = {
    id: 10,
    process_id: 2,
    worker_id: 5,
    work_date: '2026-08-12',
    shift: 'A',
    operation_mode: 'HAND',
    operation_type: 'NORMAL',
    machine_no: 'M5',
    product_name: 'P1',
    actual_time: 8,
    deduction_time: 0,
    total_time: 8,
    standard_output: 617.1,
    standard_version_id: 11,
    machine_standard_id: null,
    exclude_kqd_from_tt_snapshot: 0,
    actual_output: 100,
    tt_ok: 100,
    tt_ng: 0,
    note: 'old',
    updated_at: '2026-08-13T00:00:00.000Z',
    created_at: '2026-08-12T00:00:00.000Z'
  };
  let committed = false;
  let versionCount = 0;
  const fakeConnection = {
    beginTransaction: async () => {},
    commit: async () => { committed = true; },
    rollback: async () => {},
    release: () => {},
    query: async (sql) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/SELECT \* FROM production_reports WHERE id=\? FOR UPDATE/i.test(normalized)) return [[{ ...currentRow }], []];
      if (/SELECT \* FROM production_reports WHERE id=\? LIMIT 1/i.test(normalized)) return [[{ ...currentRow }], []];
      if (/SELECT \* FROM production_report_defects/i.test(normalized)) return [[], []];
      if (/SELECT \* FROM production_report_deductions/i.test(normalized)) return [[], []];
      if (/UPDATE production_reports SET/i.test(normalized)) {
        currentRow = { ...currentRow, note: 'new', updated_at: '2026-08-13T00:00:05.000Z' };
        return [{ affectedRows: 1 }, []];
      }
      return [[], []];
    }
  };
  const fakeDb = { promise: () => ({ getConnection: async () => fakeConnection }) };
  const stubs = {
    '../config/db': fakeDb,
    './auditService': { logActivity: async () => true },
    '../utils/reportValidation': { validateProductionReport: (payload) => ({ valid: true, normalized: { ...payload } }) },
    './reportBusinessValidationService': { validateMasterData: async () => ({ valid: true, standardOutput: 617.1, standardVersionId: 11, machineStandardId: null, excludeKqdFromTt: 0, authoritativeDefects: [] }) },
    './reportGovernanceService': { isPeriodLocked: async () => false },
    './kqdReportCalculationService': { recalculateReportOutput: ({ ttOk }) => ({ ttOk, totalNg: 0, actualOutput: ttOk }) },
    './processAuthorizationService': { assertProcessScope: async () => true },
    './approvedVersionSnapshotService': {
      createApprovedReportVersion: async () => ++versionCount,
      parseSnapshotJson: () => ({}),
      loadApprovedAggregateSnapshot: async () => ({}),
      validateApprovedVersionSnapshot: () => ({ valid: true }),
      assertApprovedVersionSnapshotSafe: () => true,
      approvedSnapshotsEqual: () => true,
      REPORT_FIELDS: [],
      MACHINE_LINE_FIELDS: []
    }
  };
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  const servicePath = path.join(backendRoot, 'services/approvedReportEditService.js');
  delete require.cache[require.resolve(servicePath)];
  try {
    const { updateApprovedReport } = require(servicePath);
    const result = await updateApprovedReport({
      reportId: 10,
      patch: { note: 'new' },
      reason: 'matching token',
      userId: 77,
      actor: { id: 77, role: 'admin' },
      expectedUpdatedAt: '2026-08-13T00:00:00.000Z',
      source: 'web'
    });
    assert.equal(committed, true);
    assert.equal(versionCount, 2, 'successful edit keeps pre/post version history');
    assert.equal(result.report.updated_at, '2026-08-13T00:00:05.000Z');
    assert.equal(result.report.note, 'new');
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(servicePath)];
  }
});

test('F07 only active human approved edit callers are web and Excel and both provide concurrency tokens', () => {
  const web = readBackend('controllers/productionController.js');
  const excel = readBackend('controllers/excelEditSyncController.js');
  assert.match(web, /expectedUpdatedAt,/);
  assert.match(excel, /expectedUpdatedAt:\s*change\?\.expected_updated_at \|\| null/);
  assert.match(excel, /source: 'excel'/);
  const service = readBackend('services/approvedReportEditService.js');
  assert.match(service, /expectedUpdatedAt = null/);
});

test('F07 F06 restore compatibility policy remains unchanged and optional', () => {
  const source = readBackend('services/approvedReportEditService.js');
  assert.match(source, /restoreApprovedReportVersion\(\{[\s\S]*expectedUpdatedAt = null/);
});
