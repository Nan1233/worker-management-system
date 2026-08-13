const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { assertProcessScope, assertProcessesScope, getActorProcessScope } = require('../services/processAuthorizationService');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function fakeAssignments(initial = {}) {
  const state = new Map(Object.entries(initial).map(([id, vals]) => [Number(id), vals.map(Number)]));
  return {
    state,
    async query(sql, params) {
      if (/manager_processes/i.test(sql)) {
        const id = Number(params[0]);
        return [(state.get(id) || []).map((process_id) => ({ process_id })), []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

async function forbidden(promise) {
  await assert.rejects(promise, (e) => e?.status === 403 && e?.code === 'PROCESS_SCOPE_FORBIDDEN');
}

test('F09 helper enforces own-process vs other-process semantics for master/formula/governance/export', async () => {
  const db = fakeAssignments({ 50:[1] });
  const actor = { id:50, role:'manager' };
  assert.equal(await assertProcessScope(actor, 1, {executor:db}), true);
  await forbidden(assertProcessScope(actor, 2, {executor:db}));
});

test('F09 zero-scope manager stays empty across scoped subsystems', async () => {
  const db = fakeAssignments({ 51:[] });
  const scope = await getActorProcessScope({id:51,role:'manager'}, db);
  assert.equal(scope.type, 'LIMITED');
  assert.equal(scope.processIds.size, 0);
  await forbidden(assertProcessesScope({id:51,role:'manager'}, [1], {executor:db}));
});

test('F09 immediate assignment change affects next authorization without new JWT', async () => {
  const db = fakeAssignments({ 52:[1] });
  const actor = {id:52,role:'manager',process_ids:[999]};
  assert.equal(await assertProcessScope(actor,1,{executor:db}),true);
  db.state.set(52,[2]);
  await forbidden(assertProcessScope(actor,1,{executor:db}));
  assert.equal(await assertProcessScope(actor,2,{executor:db}),true);
});

test('master collections are DB-scoped and master writes assert existing/resulting process', () => {
  const src = read('controllers/adminMasterController.js');
  assert.match(src, /getActorProcessScope\(req\.user\)/);
  assert.match(src, /scopeSql\(scope, 't\.process_id'/);
  assert.match(src, /assertProcessScope\(req\.user, payload\.process_id[\s\S]*MASTER_CREATE/);
  assert.match(src, /assertMasterResourceScope\(req\.user, cfg, id, connection\)/);
  assert.match(src, /MASTER_UPDATE_TARGET/);
});

test('master processes are not treated as global manager-mutatable configuration', () => {
  const src = read('controllers/adminMasterController.js');
  assert.match(src, /cfg\.table === 'processes' && req\.user\?\.role !== 'admin'/);
  assert.match(src, /Chỉ admin được tạo công đoạn/);
  assert.match(src, /Chỉ admin được sửa công đoạn/);
});

test('worker master/process assignment cannot escape actor process scope', () => {
  const src = read('controllers/adminMasterController.js');
  assert.match(src, /assertCanManageWorker\(req\.user, workerId, connection, \{ requireAllAssignments:true \}\)/);
  assert.match(src, /assertProcessesScope\(req\.user, processIds, \{ executor:connection, action:'WORKER_PROCESS_ASSIGNMENT' \}\)/);
});

test('master functional permissions remain required in routes in addition to process scope', () => {
  const routes = read('routes/adminMasterRoutes.js');
  assert.match(routes, /permission\('MASTER_VIEW'\)/);
  assert.match(routes, /permission\('MASTER_EDIT'\)/);
});

test('formula read filters products/processes/scopes by current process scope', () => {
  const src = read('controllers/formulaSettingsController.js');
  assert.match(src, /getActorProcessScope\(req\.user\)/);
  assert.match(src, /ps\.process_id IN/);
  assert.match(src, /formulaData\.processes\.filter/);
  assert.match(src, /formulaData\.scopes\.filter/);
});

test('formula PROCESS write resolves canonical process and rejects outside scope', () => {
  const src = read('controllers/formulaSettingsController.js');
  assert.match(src, /SELECT id FROM processes WHERE UPPER\(process_code\)=\?/);
  assert.match(src, /assertProcessScope\(req\.user, rows\[0\]\.id, \{ action:'FORMULA_EDIT' \}\)/);
  assert.match(src, /FORMULA_RESET/);
});

test('formula product rule by known ID resolves resource process before UPDATE', () => {
  const src = read('controllers/formulaSettingsController.js');
  const select = src.indexOf('SELECT id,process_id FROM product_standards');
  const scope = src.indexOf("assertProcessScope(req.user, rows[0].process_id");
  const update = src.indexOf('UPDATE product_standards SET exclude_kqd_from_tt');
  assert.ok(select >= 0 && scope > select && update > scope);
});

test('GLOBAL formula mutation is admin-only while functional FORMULA_EDIT remains in route', () => {
  const src = read('controllers/formulaSettingsController.js');
  const routes = read('routes/formulaSettingsRoutes.js');
  assert.match(src, /scopeCode === 'GLOBAL'[\s\S]*req\.user\?\.role !== 'admin'/);
  assert.match(routes, /permission\('FORMULA_EDIT'\)/);
});

test('governance lists and summary use backend process scope before returning counts/rows', () => {
  const src = read('controllers/governanceController.js');
  assert.match(src, /scopeSql\(scope,'pp\.process_id'/);
  assert.match(src, /scopeSql\(scope,'psv\.process_id'/);
  assert.match(src, /scopeSql\(scope,'COALESCE\(pr\.process_id,prt\.process_id\)'/);
  assert.match(src, /listPlans[\s\S]*scopeSql\(scope,'pp\.process_id'/);
});

test('governance create blocks MAI body tampering for GC manager through assertProcessScope', () => {
  const src = read('controllers/governanceController.js');
  assert.match(src, /createPlan[\s\S]*assertProcessScope\(req\.user,processId,\{action:'GOVERNANCE_PLAN_CREATE'\}\)/);
  assert.match(src, /lockPeriod[\s\S]*assertProcessScope\(req\.user,processId,\{action:'GOVERNANCE_PERIOD_LOCK'\}\)/);
});

test('global period lock mutation is admin-only', () => {
  const src = read('controllers/governanceController.js');
  assert.match(src, /processId===null[\s\S]*req\.user\?\.role!=='admin'[\s\S]*Chỉ admin được khóa kỳ toàn hệ thống/);
});

test('process Excel list and explicit process export are scoped server-side', () => {
  const ctrl = read('controllers/desktopExcelExportController.js');
  const svc = read('services/processExcelExportService.js');
  assert.match(ctrl, /listProcessesForMonth\(selectedDate\.slice\(0,7\), \{ actor:req\.user \}\)/);
  assert.match(ctrl, /assertProcessScope\(req\.user, processId, \{ action:'PROCESS_EXPORT' \}\)/);
  assert.match(svc, /listProcessesForMonth\(value, options = \{\}\)[\s\S]*getActorProcessScope\(options\.actor\)/);
  assert.match(svc, /loadProcessMonthReports\(value, processId, options = \{\}\)[\s\S]*assertProcessScope\(options\.actor, processId/);
});

test('company-wide data builder enforces complete process scope before cache/data return', () => {
  const src = read('controllers/companyExcelDataController.js');
  assert.match(src, /assertCompanyDataScope\(actor\)/);
  assert.match(src, /await assertCompanyDataScope\(actor\);[\s\S]*const cached/);
  assert.match(src, /buildCompanyData\(yearMonth, actor\)[\s\S]*assertProcessesScope\(actor, companyProcessIds/);
});

test('company group and company-all exports use subset/global scope rules', () => {
  const src = read('controllers/desktopExcelExportController.js');
  assert.match(src, /assertCompanyScope\(req\.user\)/);
  assert.match(src, /GROUPS\[groupCode\][\s\S]*assertProcessesScope\(req\.user, await processIdsForCodes\(group\.processCodes\)/);
});

test('async export job validates scope before enqueue and protects job read/download', () => {
  const src = read('controllers/excelJobController.js');
  assert.ok(src.indexOf('await authorizeJobRequest(req.user,type,payload)') < src.indexOf('queue.enqueue(type, payload'));
  assert.match(src, /type==='process'[\s\S]*assertProcessScope/);
  assert.match(src, /company-all[\s\S]*assertProcessesScope/);
  assert.match(src, /requestedBy/);
  assert.match(src, /await canReadJob\(req\.user,job\)/);
});

test('legacy monthly consolidated export is not a manager scope bypass', () => {
  const src = read('controllers/reportExportController.js');
  assert.match(src, /assertProcessesScope\(req\.user, scopeRows\.map/);
  assert.ok(src.indexOf('assertProcessesScope(req.user') < src.indexOf("excelJobManager.run('monthly'"));
});

test('F09 export routes still require REPORT_EXPORT functional permission', () => {
  const routes = read('routes/reportExportRoutes.js');
  assert.match(routes, /const canExport = permission\('REPORT_EXPORT'\)/);
  assert.match(routes, /company-data[\s\S]*canExport/);
  assert.match(routes, /export-excel\/process[\s\S]*canExport/);
});

test('authorization hardening has no authorization-specific migration; migration 023 is F11 session rotation only', () => {
  const migrationDir = path.join(__dirname, '../migrations');
  const names = fs.readdirSync(migrationDir);
  assert.deepEqual(names.filter((name) => /^023_/.test(name)), ['023_refresh_session_rotation_20260813.sql']);
});

test('company-wide subset contract passes only when manager owns every included process', async () => {
  const all=[1,2,3,4,5,6,7,8,9];
  const good=fakeAssignments({60:all});
  assert.equal(await assertProcessesScope({id:60,role:'manager'},all,{executor:good}),true);
  const partial=fakeAssignments({61:[1,2,3]});
  await forbidden(assertProcessesScope({id:61,role:'manager'},all,{executor:partial}));
});

test('admin remains globally eligible for company-wide process set', async () => {
  const executor={query(){throw new Error('admin must not query manager_processes');}};
  assert.equal(await assertProcessesScope({id:1,role:'admin'},[1,2,3,4,5,6,7,8,9],{executor}),true);
});

test('governance routes retain functional permissions and manager/admin role boundary', () => {
  const routes=read('routes/governanceRoutes.js');
  assert.match(routes,/role\('admin','manager'\)/);
  assert.match(routes,/permission\('GOVERNANCE_VIEW'\)/);
  assert.match(routes,/permission\('PERIOD_LOCK'\)/);
});

test('formula lead capability is not granted by process scope alone', () => {
  const routes=read('routes/formulaSettingsRoutes.js');
  assert.match(routes,/permission\('FORMULA_EDIT'\)/);
  assert.match(routes,/checkRole\('admin','manager','lead'\)/);
});

test('company-data service performs defense-in-depth scope assertion inside builder', () => {
  const src=read('controllers/companyExcelDataController.js');
  const build=src.indexOf('async function buildCompanyData');
  const assertAt=src.indexOf('assertProcessesScope(actor, companyProcessIds',build);
  const load=src.indexOf('loadProcessMonthReports',build);
  assert.ok(build>=0 && assertAt>build && load>assertAt);
});

test('export job current-scope access is rechecked, not only owner ID', () => {
  const src=read('controllers/excelJobController.js');
  assert.match(src,/async function canReadJob\(actor,job\)[\s\S]*authorizeJobRequest\(actor,job\.type,job\.payload/);
  assert.match(src,/exports\.download[\s\S]*await canReadJob\(req\.user,job\)/);
});

test('Google Sheet sync remains a trusted system job path, not a human F09 bypass route', () => {
  const routesDir=path.join(__dirname,'../routes');
  const routeText=fs.readdirSync(routesDir).filter((n)=>n.endsWith('.js')).map((n)=>fs.readFileSync(path.join(routesDir,n),'utf8')).join('\n');
  assert.doesNotMatch(routeText,/googleSheetService|syncProductionReport/);
  const sync=read('services/syncJobService.js');
  assert.match(sync,/googleSheetService/);
});

test('Excel master sync preview/apply asserts every workbook process against central scope', () => {
  const ctrl = read('controllers/excelMasterSyncController.js');
  const svc = read('services/excelMasterSyncService.js');
  assert.match(ctrl, /service\.preview\(req\.body \|\| \{\}, req\.user\)/);
  assert.match(ctrl, /service\.apply\(req\.body \|\| \{\}, req\.user\)/);
  const previewAt = svc.indexOf('async function preview');
  const processIds = svc.indexOf('const processIds =', previewAt);
  const scope = svc.indexOf("assertProcessesScope(actor, processIds, { action: 'EXCEL_MASTER_SYNC_PREVIEW' })", previewAt);
  const existing = svc.indexOf('loadExisting(connection, config, processIds)', previewAt);
  assert.ok(previewAt >= 0 && processIds > previewAt && scope > processIds && existing > scope);
});

test('Excel master sync history is owner-bound and current process scope is rechecked', () => {
  const svc = read('services/excelMasterSyncService.js');
  assert.match(svc, /WHERE performed_by=\?/);
  assert.match(svc, /SELECT id, performed_by FROM excel_sync_batches WHERE id=\?/);
  assert.match(svc, /assertProcessesScope\(actor, processIdsFromSyncLogRows\(rows\), \{ action: 'EXCEL_MASTER_SYNC_HISTORY' \}\)/);
});

test('Excel master sync keeps EXCEL_MASTER_SYNC functional permission in addition to process scope', () => {
  const routes = read('routes/excelMasterSyncRoutes.js');
  assert.match(routes, /permission\('EXCEL_MASTER_SYNC'\)/);
  assert.match(routes, /checkRole\('admin', 'manager'\)/);
});

test('Excel master sync adds no authorization migration; migration 023 remains F11 session rotation only', () => {
  const migrationDir = path.join(__dirname, '../migrations');
  assert.deepEqual(fs.readdirSync(migrationDir).filter((name) => /^023_/.test(name)), ['023_refresh_session_rotation_20260813.sql']);
});
