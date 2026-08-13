const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  getActorProcessScope,
  assertProcessScope,
  assertProcessesScope,
  isProcessAllowed,
  scopeSql
} = require('../services/processAuthorizationService');

function fakeAssignments(initial = {}) {
  const state = new Map(Object.entries(initial).map(([id, values]) => [Number(id), [...values].map(Number)]));
  return {
    state,
    async query(sql, params) {
      assert.match(sql, /manager_processes/i);
      const managerId = Number(params[0]);
      return [(state.get(managerId) || []).map((process_id) => ({ process_id })), []];
    }
  };
}

async function expectForbidden(promise) {
  await assert.rejects(promise, (error) => error?.status === 403 && error?.code === 'PROCESS_SCOPE_FORBIDDEN');
}

test('admin has ALL process scope without querying manager_processes', async () => {
  const executor = { query() { throw new Error('admin should not query'); } };
  const scope = await getActorProcessScope({ id: 1, role: 'admin' }, executor);
  assert.equal(scope.type, 'ALL');
  assert.equal(await assertProcessScope({ id: 1, role: 'admin' }, 999, { executor }), true);
});

test('manager own process passes and other process fails', async () => {
  const db = fakeAssignments({ 10: [1] });
  assert.equal(await assertProcessScope({ id: 10, role: 'manager' }, 1, { executor: db }), true);
  await expectForbidden(assertProcessScope({ id: 10, role: 'manager' }, 2, { executor: db }));
});

test('lead own process passes and other process fails', async () => {
  const db = fakeAssignments({ 11: [2] });
  assert.equal(await assertProcessScope({ id: 11, role: 'lead' }, 2, { executor: db }), true);
  await expectForbidden(assertProcessScope({ id: 11, role: 'lead' }, 1, { executor: db }));
});

test('manager with zero assignments is empty, never global', async () => {
  const db = fakeAssignments({ 12: [] });
  const scope = await getActorProcessScope({ id: 12, role: 'manager' }, db);
  assert.equal(scope.type, 'LIMITED');
  assert.equal(scope.processIds.size, 0);
  await expectForbidden(assertProcessScope({ id: 12, role: 'manager' }, 1, { executor: db }));
});

test('worker cannot gain management process scope from helper', async () => {
  const db = fakeAssignments({ 20: [1,2,3] });
  await expectForbidden(assertProcessScope({ id: 20, role: 'worker', process_ids: [1,2,3] }, 1, { executor: db }));
});

test('multi-process subset passes and any outside process fails', async () => {
  const db = fakeAssignments({ 13: [1,2] });
  assert.equal(await assertProcessesScope({ id: 13, role: 'manager' }, [1,2], { executor: db }), true);
  assert.equal(await assertProcessesScope({ id: 13, role: 'manager' }, [1], { executor: db }), true);
  await expectForbidden(assertProcessesScope({ id: 13, role: 'manager' }, [1,3], { executor: db }));
});

test('scope uses current DB assignment immediately without new JWT', async () => {
  const db = fakeAssignments({ 14: [1] });
  const actor = { id: 14, role: 'manager', process_ids: [999] };
  assert.equal(await isProcessAllowed(actor, 1, db), true);
  assert.equal(await isProcessAllowed(actor, 2, db), false);
  db.state.set(14, [2]);
  assert.equal(await isProcessAllowed(actor, 1, db), false);
  assert.equal(await isProcessAllowed(actor, 2, db), true);
});

test('scopeSql produces deny-all for zero-scope manager and IN filter otherwise', async () => {
  const empty = await getActorProcessScope({ id: 15, role: 'manager' }, fakeAssignments({ 15: [] }));
  assert.match(scopeSql(empty, 'pr.process_id').clause, /1=0/);
  const limited = await getActorProcessScope({ id: 16, role: 'manager' }, fakeAssignments({ 16: [3,4] }));
  const sql = scopeSql(limited, 'pr.process_id', ['2026-08-12']);
  assert.match(sql.clause, /pr\.process_id IN \(\?,\?\)/);
  assert.deepEqual(sql.params, ['2026-08-12',3,4]);
});

test('approved collection/date/by-date controllers apply backend process scope', () => {
  const src = fs.readFileSync(path.join(__dirname,'../controllers/productionController.js'),'utf8');
  assert.match(src, /getAllReports[\s\S]*getActorProcessScope\(req\.user\)[\s\S]*scopeSql\(scope, 'pr\.process_id'/);
  assert.match(src, /getReportDates[\s\S]*getActorProcessScope\(req\.user\)[\s\S]*scopeSql\(scope, 'pr\.process_id'/);
  assert.match(src, /getReportsByDate[\s\S]*assertProcessScope\(req\.user, req\.query\.process_id/);
});

test('approved detail manager/lead asserts report process scope; worker keeps ownership rule', () => {
  const src = fs.readFileSync(path.join(__dirname,'../controllers/productionController.js'),'utf8');
  assert.match(src, /role === 'worker'[\s\S]*minimal\.worker_id[\s\S]*req\.user\?\.worker_id/);
  assert.match(src, /\['manager','lead'\][\s\S]*assertProcessScope\(req\.user, minimal\.process_id/);
});

test('web edit, delete and restore all guard process before approved mutation', () => {
  const controller = fs.readFileSync(path.join(__dirname,'../controllers/productionController.js'),'utf8');
  const service = fs.readFileSync(path.join(__dirname,'../services/approvedReportEditService.js'),'utf8');
  assert.match(controller, /updateApprovedReport\([\s\S]*actor: req\.user/);
  assert.ok(controller.indexOf("assertProcessScope(req.user, lockedRows[0].process_id") < controller.indexOf("UPDATE production_reports"));
  assert.match(service, /SELECT \* FROM production_reports WHERE id=\? FOR UPDATE[\s\S]*assertProcessScope\(actor, lockedRows\[0\]\.process_id/);
  assert.match(service, /restoreApprovedReportVersion[\s\S]*SELECT \* FROM production_reports WHERE id=\? FOR UPDATE[\s\S]*assertProcessScope\(actor, currentRow\.process_id/);
});

test('Excel update and create carry actor and resolve DB process before mutation', () => {
  const ctrl = fs.readFileSync(path.join(__dirname,'../controllers/excelEditSyncController.js'),'utf8');
  const create = fs.readFileSync(path.join(__dirname,'../services/approvedReportExcelCreateService.js'),'utf8');
  assert.match(ctrl, /createApprovedReportFromExcel\([\s\S]*actor: req\.user/);
  assert.match(ctrl, /updateApprovedReport\([\s\S]*actor: req\.user/);
  assert.match(create, /SELECT id,process_code FROM processes[\s\S]*assertProcessScope\(actor, processId/);
  assert.ok(create.indexOf('assertProcessScope(actor, processId') < create.indexOf('INSERT INTO production_reports'));
});

test('machine production events reuse central process authorization service', () => {
  const src = fs.readFileSync(path.join(__dirname,'../services/machineProductionEventService.js'),'utf8');
  assert.match(src, /require\('\.\/processAuthorizationService'\)/);
  assert.match(src, /assertProcessScope\(actor, processId/);
  assert.doesNotMatch(src, /SELECT 1 FROM manager_processes WHERE manager_id=\? AND process_id=\?/);
});

test('approved route functional permissions remain in addition to process scope', () => {
  const routes = fs.readFileSync(path.join(__dirname,'../routes/productionRoutes.js'),'utf8');
  assert.match(routes, /permission\("REPORT_APPROVED_VIEW"\)/);
  assert.match(routes, /permission\("REPORT_APPROVED_EDIT"\)/);
  assert.match(routes, /permission\("REPORT_DELETE"\)/);
  assert.match(routes, /permission\("EXCEL_DB_SYNC"\)/);
});

test('no JWT/client process list is used as scope authority in central service', () => {
  const src = fs.readFileSync(path.join(__dirname,'../services/processAuthorizationService.js'),'utf8');
  assert.doesNotMatch(src, /actor\?\.process_ids|actor\.process_ids|allowedProcesses|token\.process/i);
  assert.match(src, /SELECT process_id FROM manager_processes WHERE manager_id=\?/);
});
