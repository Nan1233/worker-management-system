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

test('user management uses centralized role + process scope for view/update/promotion/delete', () => {
  const auth = read('services/processAuthorizationService.js');
  const user = read('controllers/userController.js');
  const update = read('controllers/userUpdateController.js');
  const promotion = read('controllers/workerPromotionController.js');
  const deletion = read('controllers/permanentUserDeletionController.js');
  assert.match(auth, /async function assertUserManagementScope\(actor, target/);
  assert.match(auth, /manager_processes actor_scope/);
  assert.match(user, /assertUserManagementScope\(actor, target/);
  assert.match(update, /assertUserManagementScope\(actor, target/);
  assert.match(promotion, /assertUserManagementScope\(req\.user, target/);
  assert.match(deletion, /assertUserManagementScope\(req\.user, target/);
});

test('user management scope preserves role hierarchy', async () => {
  const { assertUserManagementScope } = require('../services/processAuthorizationService');
  const db = {
    async query(sql, params) {
      if (/manager_processes actor_scope/i.test(sql)) {
        return [params[1] === 50 && params[0] === 10 ? [{ ok:1 }] : [], []];
      }
      throw new Error('Unexpected SQL');
    }
  };
  assert.equal(await assertUserManagementScope({ id:1, role:'admin' }, { id:10, role:'manager' }, { executor:db }), true);
  assert.equal(await assertUserManagementScope({ id:50, role:'manager' }, { id:10, role:'worker', worker_id:10 }, { executor:db }), true);
  await assert.rejects(
    assertUserManagementScope({ id:50, role:'manager' }, { id:10, role:'manager' }, { executor:db }),
    (e) => e?.status === 403 && e?.code === 'PROCESS_SCOPE_FORBIDDEN'
  );
  await assert.rejects(
    assertUserManagementScope({ id:50, role:'lead' }, { id:10, role:'lead' }, { executor:db }),
    (e) => e?.status === 403 && e?.code === 'PROCESS_SCOPE_FORBIDDEN'
  );
});

test('master functional permissions remain required before process-scoped master operations', () => {
  const routes = read('routes/adminMasterRoutes.js');
  assert.match(routes, /const masterPermission=\(req,res,next\)=>permission\(req\.method==='GET'\?'MASTER_VIEW':'MASTER_EDIT'\)\(req,res,next\)/);
  for (const operation of [
    "router.get('/:resource'",
    "router.post('/:resource'",
    "router.put('/:resource/:id'",
    "router.delete('/:resource/:id'"
  ]) {
    const at = routes.indexOf(operation);
    assert.ok(at >= 0, 'missing master operation');
    const tail = routes.slice(at, routes.indexOf('\n', at));
    assert.match(tail, /managerMasterAccess,masterPermission,managerResourceScope/);
  }
});

test('audit, system health and notification endpoints enforce role and scope contracts', () => {
  const routes = read('routes/systemRoutes.js');
  const controller = read('controllers/systemController.js');
  const permissions = read('services/permissionService.js');

  assert.match(routes, /\/observability[\s\S]*role\('admin',\s*'manager'\)[\s\S]*permission\('SYSTEM_HEALTH_VIEW'\)/);
  assert.match(routes, /\/activities[\s\S]*role\(\s*'admin'\s*,\s*'manager'\s*,\s*'lead'\s*\)[\s\S]*permission\(\s*'AUDIT_VIEW'\s*\)/);
  assert.match(routes, /\/deleted-reports[\s\S]*role\(\s*'admin'\s*,\s*'manager'\s*,\s*'lead'\s*\)[\s\S]*permission\(\s*'AUDIT_VIEW'\s*\)/);
  assert.match(routes, /\/notifications(?:\/unread-count)?[\\s\\S]*permission\('NOTIFICATION_VIEW'\)/);
  assert.match(controller, /a\.user_id=\?/);
  assert.match(controller, /mp\.manager_id=\?/);
  assert.match(controller, /mp2\.manager_id=\?/);
  assert.match(controller, /FROM notifications[\\s\\S]*WHERE user_id=\?/);
  assert.match(controller, /UPDATE notifications SET is_read=1, read_at=NOW\(\) WHERE id=\? AND user_id=\?/);
  assert.match(controller, /UPDATE notifications SET is_read=1, read_at=NOW\(\) WHERE user_id=\?/);
  assert.doesNotMatch(permissions, /lead: \[[^\\]]*SYSTEM_HEALTH_VIEW/);
});

test('no shared default password remains; management account creation requires explicit password', () => {
  const routes = read('routes/userRoutes.js');
  const create = read('controllers/userController.js');
  const promotion = read('controllers/workerPromotionController.js');
  const adminUi = read('../frontend/src/pages/admin/Workers.tsx');
  const managerUi = read('../frontend/src/pages/manager/Workers.tsx');
  assert.doesNotMatch(routes, /KTC_DEFAULT_LEAD_PASSWORD|123456/);
  assert.doesNotMatch(promotion, /DEFAULT_LEAD_PASSWORD|DEFAULT_MANAGER_PASSWORD|123456/);
  assert.match(create, /password\.length < 6/);
  assert.match(promotion, /crypto\.randomBytes\(18\)\.toString\('base64url'\)/);
  assert.match(promotion, /initial_password:initialPassword/);
  assert.doesNotMatch(adminUi, /123456/);
  assert.doesNotMatch(managerUi, /123456/);
});

test('Excel export, DB sync and master sync enforce permission and scope contracts', () => {
  const exportRoutes = read('routes/reportExportRoutes.js');
  const desktop = read('controllers/desktopExcelExportController.js');
  const companyData = read('controllers/companyExcelDataController.js');
  const dbSync = read('controllers/excelEditSyncController.js');
  const master = read('services/excelMasterSyncService.js');
  assert.match(exportRoutes, /authMiddleware, roles, canExport/);
  assert.match(exportRoutes, /export-excel\/process[\s\S]*canExport/);
  assert.match(desktop, /assertProcessScope\(req\.user, processId, \{ action:'PROCESS_EXPORT' \}\)/);
  assert.match(desktop, /assertCompanyScope/);
  assert.match(companyData, /getActorProcessScope\(actor\)/);
  assert.match(dbSync, /hasPermission\(req\.user, 'EXCEL_DB_SYNC'\)/);
  assert.match(master, /hasPermission\(actor, 'EXCEL_MASTER_SYNC'\)/);
  assert.match(master, /assertProcessesScope\(actor, processIds, \{ action: 'EXCEL_MASTER_SYNC_PREVIEW' \}\)/);
  assert.match(master, /EXCEL_MASTER_SYNC_HISTORY/);
});

test('approved edit/delete/restore use permission, role, scope and audit contracts', () => {
  const routes = read('routes/productionRoutes.js');
  const controller = read('controllers/productionController.js');
  const service = read('services/approvedReportEditService.js');
  assert.match(routes, /router\.put\("\/:id"[\s\S]*checkRole\("admin","manager","lead"\)[\s\S]*permission\("REPORT_APPROVED_EDIT"\)/);
  assert.match(routes, /versions\/:versionNo\/restore[\s\S]*checkRole\("admin","manager","lead"\)[\s\S]*permission\("REPORT_APPROVED_EDIT"\)/);
  assert.match(routes, /router\.delete\("\/:id"[\s\S]*checkRole\("admin","manager","lead"\)[\s\S]*permission\("REPORT_DELETE"\)/);
  assert.match(service, /hasPermission\(actor, 'REPORT_APPROVED_EDIT'\)/);
  assert.match(service, /assertProcessScope\(actor, lockedRows\[0\]\.process_id/);
  assert.match(service, /assertProcessScope\(actor, currentRow\.process_id/);
  assert.match(service, /REPORT_RESTORED/);
  assert.match(controller, /hasPermission\(req\.user,'REPORT_DELETE'\)/);
  assert.match(controller, /assertProcessScope\(req\.user,lockedRows\[0\]\.process_id/);
  assert.match(controller, /REPORT_DELETED/);
});

test('pending approve/reject and edit require functional permission plus process scope', () => {
  const routes = read('routes/productionTempRoutes.js');
  const ctrl = read('controllers/productionTempManagementController.js');
  assert.match(routes, /approve-selected[\s\S]*permission\("REPORT_APPROVE"\)/);
  assert.match(routes, /reject-selected[\s\S]*permission\("REPORT_APPROVE"\)/);
  assert.match(routes, /router\.put\("\/:id"[\s\S]*permission\("REPORT_PENDING_EDIT","REPORT_APPROVE","WORKER_ENTRY"\)/);
  assert.match(ctrl, /hasPermission\(req\.user, "REPORT_APPROVE"\)/);
  assert.match(ctrl, /assertProcessesScope\(req\.user, scopeRows\.map\(\(row\) => row\.process_id\)/);
  assert.match(ctrl, /requiredPermission[\s\S]*REPORT_PENDING_EDIT/);
  assert.match(ctrl, /assertProcessesScope\(req\.user, \[current\.process_id\], \{ action:"REPORT_PENDING_EDIT" \}\)/);
  assert.match(ctrl, /WORKER_OWNERSHIP_FORBIDDEN/);
});

test('approval model still enforces manager_processes at transaction boundary', () => {
  const approval = read('models/productionTempApprovalModel.js');
  assert.match(approval, /manager_processes mp ON mp\.process_id=temp\.process_id/);
  assert.match(approval, /mp\.manager_id = \?/);
  assert.match(approval, /status IN \('pending','need_fix'\)/);
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

test('formula management API is intentionally removed from public application routes', () => {
  const routes = read('routes/formulaSettingsRoutes.js');
  assert.match(routes, /FORMULA_FEATURE_REMOVED/);
  assert.match(routes, /res\.status\(404\)/);
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
  assert.match(src, /createPlan[\s\S]*assertProcessScope\(req\.user,processId,\{action:'GOVERNANCE_PLAN_CREATE'\}\)/);});

test('reporting period lock contract is removed from application code', () => {
  const src = read('controllers/governanceController.js');
  assert.doesNotMatch(src, /Chỉ admin được khóa kỳ toàn hệ thống/);
  assert.doesNotMatch(src, /processId===null[\s\S]*khóa kỳ/);
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
  assert.match(src, /async function assertCompanyDataScope\(actor\)/);
  assert.match(src, /await assertCompanyDataScope\(actor\);[\s\S]*const cached/);
  assert.match(src, /buildCompanyData\(yearMonth, actor\)[\s\S]*await assertCompanyDataScope\(actor\)/);
  assert.match(src, /assertProcessesScope\(actor, companyProcessIds/);
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

test('legacy monthly consolidated export is disabled; Desktop async export is the active path', () => {
  const src = read('controllers/reportExportController.js');
  assert.match(src, /DESKTOP_EXCEL_REQUIRED/);
  assert.match(src, /res\.status\(503\)/);
});

test('F09 export routes still require REPORT_EXPORT functional permission', () => {
  const routes = read('routes/reportExportRoutes.js');
  assert.match(routes, /const canExport = permission\('REPORT_EXPORT'\)/);
  assert.match(routes, /company-data[\s\S]*canExport/);
  assert.match(routes, /export-excel\/process[\s\S]*canExport/);
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
  assert.match(routes,/permission\('GOVERNANCE_VIEW'\)/);});

test('formula lead capability is not exposed after formula feature removal', () => {
  const routes=read('routes/formulaSettingsRoutes.js');
  assert.doesNotMatch(routes,/FORMULA_EDIT/);
  assert.match(routes,/FORMULA_FEATURE_REMOVED/);
});

test('company-data service performs defense-in-depth scope assertion inside builder', () => {
  const src=read('controllers/companyExcelDataController.js');
  const build=src.indexOf('async function buildCompanyData');
  const assertAt=src.indexOf('await assertCompanyDataScope(actor)',build);
  const load=src.indexOf('loadBulkCompanyReports(yearMonth, actor)',build);
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
