const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve('../config/db');

function deep(value) { return JSON.parse(JSON.stringify(value)); }

function baseReport(overrides = {}) {
  return {
    id: 9, source_temp_id: 3, worker_id: 101, process_id: 4,
    work_date: '2026-08-11', entry_date: '2026-08-11', shift: 'A',
    operation_type: 'CUT', operation_mode: 'MACHINE', machine_no: '5', product_name: 'PX',
    total_time: '8.0000', actual_time: '8.0000', deduction_time: '0.0000',
    standard_output: '900.770000', standard_version_id: 62, machine_standard_id: null,
    training_percent_snapshot: '100.00', exclude_kqd_from_tt_snapshot: 0,
    actual_output: '800.000000', tt_ok: 790, tt_ng: 10,
    kqd_dap_lai: 0, kqd_tuot: 0, vo_do_long: 0, xuoc_do_long: 0, cong_gay: 0,
    xoay: 0, khong_dut: 0, bavia_hut: 0, ppcm: 0, loi_cao_su: 0, ng_kich_thuoc: 0, cat_lem: 0,
    note: 'V2', extra_data: { source: 'web' }, status: 'approved', review_note: 'v2',
    created_at: '2026-08-11T01:00:00.000Z', updated_at: '2026-08-12T01:00:00.000Z',
    ...overrides
  };
}

function machineLine(overrides = {}) {
  return {
    id: 21, report_id: 9, machine_event_id: 200, machine_id: 5, machine_code: '5',
    product_standard_id: 44, standard_version_id: 62, machine_standard_id: null, product_code: 'PX',
    machine_time_hours: '8.0000', standard_output: '900.770000', standard_time_seconds: '3.996500',
    standard_source: 'PRODUCT', exclude_kqd_from_tt: 0, ok_quantity: 790, ng_quantity: 10,
    maximum_output: '7206.160000', deduction_time_hours: '0.0000', deductions_json: [],
    counted_output: '800.000000', earned_standard_hours: '0.888129', defects_json: [], sort_order: 1,
    ...overrides
  };
}

function targetSnapshot() {
  return {
    schemaVersion: 2,
    report: {
      id: 9, source_temp_id: 3, worker_id: 101, process_id: 4,
      work_date: '2026-08-10', entry_date: '2026-08-10', shift: 'A', operation_type: 'CUT', operation_mode: 'MACHINE',
      machine_no: '5', product_name: 'PX', total_time: '8.5000', actual_time: '8.0000', deduction_time: '0.5000',
      standard_output: '617.100000', standard_version_id: 61, machine_standard_id: null,
      training_percent_snapshot: '50.00', exclude_kqd_from_tt_snapshot: 1,
      actual_output: '1500.000000', tt_ok: 1490, tt_ng: 10,
      kqd_dap_lai: 0, kqd_tuot: 0, vo_do_long: 0, xuoc_do_long: 0, cong_gay: 0,
      xoay: 0, khong_dut: 0, bavia_hut: 0, ppcm: 0, loi_cao_su: 0, ng_kich_thuoc: 0, cat_lem: 0,
      note: 'V1', extra_data: { source: 'worker' }, status: 'approved', review_note: null
    },
    defects: [{ defect_type_id: 2, quantity: 6 }, { defect_type_id: 5, quantity: 4 }],
    deductions: [{ deduction_type_id: 4, hours: '0.5000' }],
    machineLines: [
      {
        line: {
          machine_event_id: 100, machine_id: 5, machine_code: '5', product_standard_id: 44,
          standard_version_id: 61, machine_standard_id: null, product_code: 'PX', machine_time_hours: '5.0000',
          standard_output: '617.100000', standard_time_seconds: '5.833900', standard_source: 'PRODUCT', exclude_kqd_from_tt: 1,
          ok_quantity: 990, ng_quantity: 10, maximum_output: '3085.500000', deduction_time_hours: '0.0000', deductions_json: [],
          counted_output: '1000.000000', earned_standard_hours: '1.620480', defects_json: [], sort_order: 1
        },
        defects: [
          { defect_type_id: 5, defect_code: 'KQD', defect_name: 'KQD', quantity: 4 },
          { defect_type_id: 2, defect_code: 'RACH', defect_name: 'Rách', quantity: 6 }
        ]
      },
      {
        line: {
          machine_event_id: null, machine_id: 6, machine_code: '6', product_standard_id: 45,
          standard_version_id: 63, machine_standard_id: null, product_code: 'PX', machine_time_hours: '3.0000',
          standard_output: '309.760000', standard_time_seconds: '11.621900', standard_source: 'PRODUCT', exclude_kqd_from_tt: 1,
          ok_quantity: 500, ng_quantity: 0, maximum_output: '929.280000', deduction_time_hours: '0.0000', deductions_json: [],
          counted_output: '500.000000', earned_standard_hours: '1.614154', defects_json: [], sort_order: 2
        },
        defects: []
      }
    ]
  };
}

function makeState() {
  const target = targetSnapshot();
  return {
    report: baseReport(),
    defects: [{ id: 31, report_id: 9, defect_type_id: 2, quantity: 7 }, { id: 32, report_id: 9, defect_type_id: 5, quantity: 3 }],
    deductions: [{ id: 41, report_id: 9, deduction_type_id: 8, hours: '1.0000' }],
    machineLines: [
      machineLine({ id: 21, machine_event_id: 200, counted_output: '800.000000', ok_quantity: 790, ng_quantity: 10 }),
      machineLine({ id: 22, machine_event_id: null, machine_id: 7, machine_code: '7', product_standard_id: 46, standard_version_id: 64, counted_output: '600.000000', ok_quantity: 600, ng_quantity: 0, sort_order: 2 })
    ],
    machineDefects: [{ id: 51, machine_line_id: 21, defect_type_id: 2, defect_code: 'RACH', defect_name: 'Rách', quantity: 7 }],
    events: {
      100: { id: 100, process_id: 4, machine_id: 5, machine_code: '5', product_code: 'PX', work_date: '2026-08-10', shift: 'A', status: 'approved', physical_counted_output: '1000.000000' },
      200: { id: 200, process_id: 4, machine_id: 5, machine_code: '5', product_code: 'PX', work_date: '2026-08-11', shift: 'A', status: 'approved', physical_counted_output: '950.000000' }
    },
    otherWorker: { report_id: 88, machine_event_id: 100, counted_output: '1000.000000' },
    versions: [{ report_id: 9, version_no: 1, snapshot_json: JSON.stringify(target), change_reason: 'V1' }],
    activities: [], nextLineId: 1000, updatedTick: 2
  };
}

function createFakeDb(initial, options = {}) {
  let state = deep(initial);
  let txBackup = null;
  const controls = { ...options };

  function rowsForMachineDefects() {
    const lineIds = new Set(state.machineLines.map((x) => Number(x.id)));
    return state.machineDefects.filter((x) => lineIds.has(Number(x.machine_line_id)));
  }

  const connection = {
    async beginTransaction() { txBackup = deep(state); },
    async commit() { txBackup = null; },
    async rollback() { if (txBackup) state = deep(txBackup); txBackup = null; },
    release() {},
    async query(sql, params = []) {
      const q = String(sql).replace(/\s+/g, ' ').trim();
      if (/INFORMATION_SCHEMA\.COLUMNS/i.test(q)) return [[], []];
      if (/^CREATE TABLE/i.test(q)) return [[], []];
      if (/^SELECT \* FROM production_reports WHERE id=\? FOR UPDATE/i.test(q)) return [[deep(state.report)], []];
      if (/^SELECT \* FROM production_reports WHERE id=\? LIMIT 1/i.test(q)) return [[deep(state.report)], []];
      if (/^DELETE FROM production_report_defects/i.test(q)) { state.defects = []; return [{ affectedRows: 1 }, []]; }
      if (/^DELETE FROM production_report_deductions/i.test(q)) { state.deductions = []; return [{ affectedRows: 1 }, []]; }
      if (/FROM production_report_defects/i.test(q)) return [deep(state.defects), []];
      if (/FROM production_report_deductions/i.test(q)) return [deep(state.deductions), []];
      if (/^DELETE md FROM production_report_machine_defects/i.test(q)) { state.machineDefects = []; return [{ affectedRows: 1 }, []]; }
      if (/FROM production_report_machine_defects md/i.test(q)) {
        let list = rowsForMachineDefects().map((x) => deep(x));
        if (controls.corruptReload && controls.didInsertLine) list = list.map((x) => ({ ...x }));
        return [list, []];
      }
      if (/FROM production_report_machine_lines/i.test(q) && !/^DELETE/i.test(q) && !/^INSERT/i.test(q)) {
        let list = deep(state.machineLines);
        if (controls.corruptReload && controls.didInsertLine) list[0] = { ...list[0], counted_output: '999999.000000' };
        return [list, []];
      }
      if (/FROM report_versions/i.test(q) && /snapshot_json/i.test(q) && /version_no=\?/i.test(q)) {
        const version = state.versions.find((x) => Number(x.report_id) === Number(params[0]) && Number(x.version_no) === Number(params[1]));
        return [version ? [{ snapshot_json: version.snapshot_json }] : [], []];
      }
      if (/SELECT id FROM reporting_period_locks/i.test(q)) return [[], []];
      if (/FROM machine_production_events/i.test(q)) {
        if (/(?:UPDATE|DELETE)/i.test(q)) throw new Error('PHYSICAL_EVENT_MUTATION_FORBIDDEN');
        const event = state.events[Number(params[0])];
        return [event ? [deep(event)] : [], []];
      }
      if (/COALESCE\(MAX\(version_no\)/i.test(q)) {
        const max = state.versions.filter((x) => Number(x.report_id) === Number(params[1])).reduce((m, x) => Math.max(m, Number(x.version_no)), 0);
        return [[{ next_version: max + 1 }], []];
      }
      if (/^INSERT INTO report_versions/i.test(q)) {
        state.versions.push({ report_id: Number(params[1]), version_no: Number(params[2]), snapshot_json: String(params[3]), change_reason: params[4] });
        return [{ insertId: state.versions.length }, []];
      }
      if (/^UPDATE production_reports SET/i.test(q)) {
        if (controls.failParentUpdate) throw new Error('FAIL_PARENT_UPDATE');
        const { REPORT_FIELDS } = require('../services/approvedVersionSnapshotService');
        const fields = REPORT_FIELDS.filter((x) => x !== 'id');
        fields.forEach((field, index) => {
          let value = params[index];
          if (field === 'extra_data' && typeof value === 'string') { try { value = JSON.parse(value); } catch {} }
          state.report[field] = value;
        });
        state.updatedTick += 1;
        state.report.updated_at = `2026-08-12T0${state.updatedTick}:00:00.000Z`;
        return [{ affectedRows: 1 }, []];
      }
      if (/^INSERT INTO production_report_defects/i.test(q)) {
        state.defects.push({ id: 100 + state.defects.length, report_id: Number(params[0]), defect_type_id: Number(params[1]), quantity: params[2] });
        return [{ insertId: 100 + state.defects.length }, []];
      }
      if (/^INSERT INTO production_report_deductions/i.test(q)) {
        state.deductions.push({ id: 200 + state.deductions.length, report_id: Number(params[0]), deduction_type_id: Number(params[1]), hours: params[2] });
        return [{ insertId: 200 + state.deductions.length }, []];
      }
      if (/^DELETE FROM production_report_machine_lines/i.test(q)) { state.machineLines = []; return [{ affectedRows: 1 }, []]; }
      if (/^INSERT INTO production_report_machine_lines/i.test(q)) {
        if (controls.failMachineLineInsert) throw new Error('FAIL_MACHINE_LINE_INSERT');
        const { MACHINE_LINE_FIELDS } = require('../services/approvedVersionSnapshotService');
        const row = { id: state.nextLineId++, report_id: Number(params[0]) };
        MACHINE_LINE_FIELDS.forEach((field, index) => {
          let value = params[index + 1];
          if ((field === 'deductions_json' || field === 'defects_json') && typeof value === 'string') { try { value = JSON.parse(value); } catch {} }
          row[field] = value;
        });
        state.machineLines.push(row);
        controls.didInsertLine = true;
        return [{ insertId: row.id }, []];
      }
      if (/^INSERT INTO production_report_machine_defects/i.test(q)) {
        if (controls.failMachineDefectInsert) throw new Error('FAIL_MACHINE_DEFECT_INSERT');
        state.machineDefects.push({ id: 300 + state.machineDefects.length, machine_line_id: Number(params[0]), defect_type_id: params[1], defect_code: params[2], defect_name: params[3], quantity: params[4] });
        return [{ insertId: 300 + state.machineDefects.length }, []];
      }
      if (/^INSERT INTO activity_logs/i.test(q)) { state.activities.push({ action: params[1], metadata_json: params[5] }); return [{ insertId: 1 }, []]; }
      throw new Error(`Unexpected SQL: ${q}`);
    }
  };

  const fakeDb = { promise() { return { getConnection: async () => connection, query: connection.query.bind(connection) }; } };
  return { fakeDb, connection, getState: () => deep(state), controls };
}

function loadRestoreWithFakeDb(fakeDb) {
  for (const modulePath of [
    '../services/approvedReportEditService', '../services/approvedVersionSnapshotService', '../services/auditService',
    '../services/reportGovernanceService', '../services/processAuthorizationService'
  ]) {
    try { delete require.cache[require.resolve(modulePath)]; } catch {}
  }
  delete require.cache[DB_PATH];
  require.cache[DB_PATH] = { id: DB_PATH, filename: DB_PATH, loaded: true, exports: fakeDb };
  return require('../services/approvedReportEditService');
}

async function successfulRestore(options = {}) {
  const initial = makeState();
  const env = createFakeDb(initial, options);
  const service = loadRestoreWithFakeDb(env.fakeDb);
  const result = await service.restoreApprovedReportVersion({
    reportId: 9, versionNo: 1, reason: 'restore v1', userId: 77,
    actor: { id: 77, role: 'admin' }, expectedUpdatedAt: initial.report.updated_at
  });
  return { initial, env, service, result };
}

test('atomic full restore reproduces complete parent F01/F03/F04 snapshot and exact child graph', async () => {
  const { env, result } = await successfulRestore();
  const state = env.getState();
  assert.equal(state.report.standard_output, '617.100000');
  assert.equal(state.report.standard_version_id, 61);
  assert.equal(state.report.training_percent_snapshot, '50.00');
  assert.equal(state.report.exclude_kqd_from_tt_snapshot, 1);
  assert.equal(state.report.note, 'V1');
  assert.deepEqual(state.defects.map((x) => [x.defect_type_id, x.quantity]), [[2, 6], [5, 4]]);
  assert.deepEqual(state.deductions.map((x) => [x.deduction_type_id, x.hours]), [[4, '0.5000']]);
  assert.deepEqual(state.machineLines.map((x) => [x.machine_code, x.counted_output]), [['5', '1000.000000'], ['6', '500.000000']]);
  assert.deepEqual(state.machineDefects.map((x) => [x.defect_code, x.quantity]), [['KQD', 4], ['RACH', 6]]);
  assert.equal(result.aggregate.schemaVersion, 2);
});

test('restore creates fresh machine-line IDs and nests machine defects on the new IDs', async () => {
  const { env } = await successfulRestore();
  const state = env.getState();
  assert.ok(state.machineLines.every((x) => x.id >= 1000));
  const lineIds = new Set(state.machineLines.map((x) => x.id));
  assert.ok(state.machineDefects.every((x) => lineIds.has(x.machine_line_id)));
});

test('F05 event link is restored while shared physical event and Worker B remain unchanged', async () => {
  const initial = makeState();
  const beforeEvents = deep(initial.events);
  const beforeB = deep(initial.otherWorker);
  const env = createFakeDb(initial);
  const service = loadRestoreWithFakeDb(env.fakeDb);
  await service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' }, expectedUpdatedAt: initial.report.updated_at });
  const state = env.getState();
  assert.equal(state.machineLines[0].machine_event_id, 100);
  assert.deepEqual(state.events, beforeEvents);
  assert.deepEqual(state.otherWorker, beforeB);
});

test('missing machine event fails closed before mutation/version creation', async () => {
  const initial = makeState(); delete initial.events[100];
  const env = createFakeDb(initial); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' } }), (e) => e.code === 'ROLLBACK_EVENT_LINK_INVALID');
  assert.deepEqual(env.getState(), before);
});

test('machine event dimension mismatch fails closed', async () => {
  const initial = makeState(); initial.events[100].product_code = 'OTHER';
  const env = createFakeDb(initial); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' } }), (e) => e.code === 'ROLLBACK_EVENT_LINK_INVALID');
  assert.deepEqual(env.getState(), before);
});

test('pending machine event fails approved-report restore invariant', async () => {
  const initial = makeState(); initial.events[100].status = 'pending';
  const env = createFakeDb(initial); const service = loadRestoreWithFakeDb(env.fakeDb);
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' } }), (e) => e.code === 'ROLLBACK_EVENT_LINK_INVALID');
});

test('stale expected_updated_at returns REPORT_VERSION_CONFLICT with zero mutation', async () => {
  const initial = makeState(); const env = createFakeDb(initial); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' }, expectedUpdatedAt: '2026-08-01T00:00:00Z' }), (e) => e.code === 'REPORT_VERSION_CONFLICT');
  assert.deepEqual(env.getState(), before);
});

test('expected_updated_at remains temporarily optional for backwards API compatibility', async () => {
  const initial = makeState();
  const env = createFakeDb(initial);
  const service = loadRestoreWithFakeDb(env.fakeDb);
  await service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'legacy client', userId: 77, actor: { id: 77, role: 'admin' } });
  assert.equal(env.getState().report.note, 'V1');
});

test('restore is reversible: pre-restore full aggregate can be restored back', async () => {
  const { env, service, result } = await successfulRestore();
  const afterFirst = env.getState();
  assert.ok(result.pre_restore_version > 1);
  await service.restoreApprovedReportVersion({ reportId: 9, versionNo: result.pre_restore_version, reason: 'undo rollback', userId: 77, actor: { id: 77, role: 'admin' }, expectedUpdatedAt: afterFirst.report.updated_at });
  const state = env.getState();
  assert.equal(state.report.standard_output, '900.770000');
  assert.equal(state.report.training_percent_snapshot, '100.00');
  assert.deepEqual(state.machineLines.map((x) => x.machine_code), ['5', '7']);
  assert.equal(state.machineLines[0].machine_event_id, 200);
});

for (const [name, option, expected] of [
  ['parent update failure rolls back entire transaction', 'failParentUpdate', 'FAIL_PARENT_UPDATE'],
  ['machine line insert failure rolls back parent defects deductions and versions', 'failMachineLineInsert', 'FAIL_MACHINE_LINE_INSERT'],
  ['machine defect insert failure rolls back whole graph', 'failMachineDefectInsert', 'FAIL_MACHINE_DEFECT_INSERT']
]) {
  test(name, async () => {
    const initial = makeState(); const env = createFakeDb(initial, { [option]: true }); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
    await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' } }), new RegExp(expected));
    assert.deepEqual(env.getState(), before);
  });
}

test('post-restore semantic mismatch rolls back current state and pre-version insert', async () => {
  const initial = makeState(); const env = createFakeDb(initial, { corruptReload: true }); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'v1', userId: 77, actor: { id: 77, role: 'admin' } }), (e) => e.code === 'ROLLBACK_RESTORE_MISMATCH');
  assert.deepEqual(env.getState(), before);
});

test('legacy/incomplete target is rejected without current-master hydration', async () => {
  const initial = makeState(); initial.versions[0].snapshot_json = JSON.stringify({ id: 9, worker_id: 101, process_id: 4, defects: [], deductions: [] });
  const env = createFakeDb(initial); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'legacy', userId: 77, actor: { id: 77, role: 'admin' } }), (e) => e.code === 'ROLLBACK_VERSION_UNSAFE' || e.code === 'ROLLBACK_SNAPSHOT_INVALID');
  assert.deepEqual(env.getState(), before);
});

test('malformed target JSON is rejected before mutation', async () => {
  const initial = makeState(); initial.versions[0].snapshot_json = '{broken';
  const env = createFakeDb(initial); const service = loadRestoreWithFakeDb(env.fakeDb); const before = env.getState();
  await assert.rejects(() => service.restoreApprovedReportVersion({ reportId: 9, versionNo: 1, reason: 'bad', userId: 77, actor: { id: 77, role: 'admin' } }), (e) => e.code === 'ROLLBACK_SNAPSHOT_INVALID');
  assert.deepEqual(env.getState(), before);
});

test('restore path has no current standard/training/KQD master resolution and never mutates physical events', () => {
  const source = fs.readFileSync(path.join(ROOT, 'services/approvedReportEditService.js'), 'utf8');
  const restore = source.slice(source.indexOf('async function restoreApprovedReportVersion'));
  assert.doesNotMatch(restore, /validateMasterData|workers\.training_percent|product_standards|standardResolutionService|recalculateReportOutput/);
  assert.doesNotMatch(restore, /UPDATE\s+machine_production_events|DELETE\s+FROM\s+machine_production_events/i);
  assert.match(restore, /validateApprovedVersionSnapshot/);
  assert.match(restore, /validateRestoreEventLinks/);
  assert.match(restore, /approvedSnapshotsEqual/);
});

test('restore API forwards expected_updated_at and frontend sends current report updated_at', () => {
  const controller = fs.readFileSync(path.join(ROOT, 'controllers/productionController.js'), 'utf8');
  const frontendService = fs.readFileSync(path.join(ROOT, '../frontend/src/services/systemService.ts'), 'utf8');
  const detail = fs.readFileSync(path.join(ROOT, '../frontend/src/pages/manager/ReportDetail.tsx'), 'utf8');
  assert.match(controller, /expectedUpdatedAt:\s*req\.body\?\.expected_updated_at/);
  assert.match(frontendService, /expected_updated_at:expectedUpdatedAt/);
  assert.match(detail, /report\.updated_at\s*\|\|\s*null/);
});

test('restore parent update includes complete F01 F03 F04 fields while preserving report id and runtime timestamps', () => {
  const source = fs.readFileSync(path.join(ROOT, 'services/approvedReportEditService.js'), 'utf8');
  assert.match(source, /REPORT_FIELDS\.filter\(\(field\) => !\['id'\]\.includes\(field\)\)/);
  assert.match(source, /updated_at=NOW\(\) WHERE id=\?/);
  assert.doesNotMatch(require('../services/approvedVersionSnapshotService').REPORT_FIELDS.join(','), /updated_at|created_at|updated_by/);
});

test('semantic post-compare treats equivalent DECIMAL DB strings as equal without integer coercion', () => {
  const { approvedSnapshotsEqual } = require('../services/approvedVersionSnapshotService');
  const target = targetSnapshot();
  const reloaded = JSON.parse(JSON.stringify(target));
  target.report.standard_output = 617.1;
  reloaded.report.standard_output = '617.100000';
  target.report.total_time = 8;
  reloaded.report.total_time = '8.0000';
  target.machineLines[0].line.standard_output = 617.1;
  reloaded.machineLines[0].line.standard_output = '617.100000';
  target.machineLines[0].line.machine_time_hours = 8;
  reloaded.machineLines[0].line.machine_time_hours = '8.0000';
  assert.equal(approvedSnapshotsEqual(target, reloaded), true);

  reloaded.report.standard_output = '617.200000';
  assert.equal(approvedSnapshotsEqual(target, reloaded), false);
});

test('semantic comparison does not coerce product codes or arbitrary JSON strings', () => {
  const { approvedSnapshotsEqual } = require('../services/approvedVersionSnapshotService');
  const left = targetSnapshot();
  const right = JSON.parse(JSON.stringify(left));
  left.machineLines[0].line.product_code = '00123';
  right.machineLines[0].line.product_code = '123';
  assert.equal(approvedSnapshotsEqual(left, right), false);

  left.report.extra_data = { batch: '00123' };
  right.report.extra_data = { batch: '123' };
  right.machineLines[0].line.product_code = '00123';
  assert.equal(approvedSnapshotsEqual(left, right), false);
});
