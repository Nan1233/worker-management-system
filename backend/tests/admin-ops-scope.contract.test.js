const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('admin_ops has operational defaults but a hard permission ceiling', () => {
  const service = read('services/permissionService.js');
  assert.match(service, /admin_ops:\s*\['DASHBOARD_VIEW','REPORT_PENDING_VIEW','REPORT_APPROVE','REPORT_APPROVED_VIEW','REPORT_APPROVED_EDIT','REPORT_EXPORT','USER_VIEW','USER_CREATE','USER_EDIT','MASTER_VIEW','STATISTICS_VIEW','NOTIFICATION_VIEW','AUDIT_VIEW','PROFILE_VIEW'\]/);
  assert.match(service, /if \(role === 'admin_ops'\)[\s\S]*?CAPABILITIES\.admin_ops\.has\(code\)/);
  for (const denied of ['REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','MASTER_EDIT','GOVERNANCE_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY','REPORT_PENDING_EDIT']) {
    assert.match(service, new RegExp(denied));
  }
});

test('admin_ops is accepted by the management login flow', () => {
  const auth = read('controllers/authController.js');
  const storage = read('../frontend/src/utils/authStorage.ts');
  assert.match(auth, /admin_ops/);
  assert.match(storage, /\"admin_ops\"/);
});

test('admin_ops receives only assigned process scope, never global scope by role', () => {
  const auth = read('services/processAuthorizationService.js');
  assert.match(auth, /if \(role === 'admin'\) return \{ type: 'ALL', processIds: null \}/);
  assert.match(auth, /\['manager', 'lead', 'admin_ops'\]/);
  assert.match(auth, /SELECT process_id FROM manager_processes WHERE manager_id=\?/);
  assert.match(auth, /role === 'admin_ops'[\s\S]*?\['lead','worker'\]/);
});

test('admin_ops cannot alter existing users process assignments', () => {
  const update = read('controllers/userUpdateController.js');
  const frontend = read('../frontend/src/pages/manager/Workers.tsx');
  assert.match(update, /processIdsProvided && req\.user\?\.role === 'admin_ops'[\s\S]*?không được thay đổi phân công công đoạn/);
  assert.match(frontend, /if \(!\(isAdminOps && modal\.id\)\) body\.process_ids = modal\.process_ids/);
  assert.match(frontend, /Các phân công hiện tại sẽ được giữ nguyên/);
});

test('admin_ops cannot promote users, bulk-import users, or permanently delete accounts', () => {
  const routes = read('routes/userRoutes.js');
  assert.match(routes, /router\.use\(verifyToken, checkRole\('admin','admin_ops','manager','lead'\)\)/);
  assert.match(routes, /req\.user\?\.role === 'admin_ops'[\s\S]*?không được nhập Excel hàng loạt/);
  assert.match(routes, /req\.user\?\.role === 'admin_ops'[\s\S]*?không được nâng cấp vai trò tài khoản/);
  assert.match(routes, /req\.user\?\.role === 'admin_ops'[\s\S]*?không được xóa vĩnh viễn tài khoản/);
});

test('admin_ops Excel export is process-scoped and company-wide export jobs are denied', () => {
  const routes = read('routes/reportExportRoutes.js');
  assert.match(routes, /assertActorProcessAccess/);
  assert.match(routes, /requireRequestedProcessScope/);
  assert.match(routes, /requireGcProcessScope/);
  assert.ok(routes.includes("UPPER(TRIM(process_code))='GC'"));
  assert.doesNotMatch(routes, /assertActorProcessAccess\(req\.user,1,/);
  assert.match(routes, /denyAdminOpsCompanyWide/);
  assert.match(routes, /export-excel\/company-data.*denyAdminOpsCompanyWide/);
  assert.match(routes, /export-excel\/company-status.*denyAdminOpsCompanyWide/);
  assert.match(routes, /export-excel\/process.*requireRequestedProcessScope/);
});

test('legacy master route cannot accidentally grant admin_ops writes via MASTER_VIEW OR MASTER_EDIT', () => {
  const legacy = read('routes/managerMasterRoutes.js');
  assert.doesNotMatch(legacy, /checkRole\('admin_ops'/);
  const scoped = read('routes/adminMasterRoutes.js');
  assert.match(scoped, /MANAGEMENT_ROLES=\['admin','admin_ops','manager','lead'\]/);
  assert.match(scoped, /req\.method==='GET'\?'MASTER_VIEW':'MASTER_EDIT'/);
});

test('frontend registers the restricted admin_ops workspace and role type', () => {
  const types = read('../frontend/src/types/auth.ts');
  const router = read('../frontend/src/routes/AppRouter.tsx');
  const permissions = read('../frontend/src/security/permissions.ts');
  const masterTabs = read('../frontend/src/pages/admin/LeadManagerMasterData.tsx');
  const dashboard = read('../frontend/src/pages/manager/Dashboard.tsx');
  const detail = read('../frontend/src/pages/manager/ReportDetail.tsx');
  assert.match(types, /"admin_ops"/);
  assert.match(router, /path="\/admin-ops"[\s\S]*?allowedRoles=\{\["admin_ops"\]\}/);
  assert.match(router, /path="report\/:id"/);
  assert.match(permissions, /admin_ops:/);
  assert.match(masterTabs, /admin_ops/);
  assert.match(dashboard, /"\/admin-ops"/);
  assert.match(detail, /"\/admin-ops"/);
  assert.match(permissions, /'REPORT_DELETE','EXCEL_DB_SYNC','EXCEL_MASTER_SYNC','MASTER_EDIT','GOVERNANCE_VIEW','SYSTEM_HEALTH_VIEW','PERMISSION_MANAGE','WORKER_ENTRY','WORKER_HISTORY'/);
});

test('admin_ops approved-report detail enforces assigned process scope', () => {
  const controller = read('controllers/productionController.js');
  assert.match(controller, /else if\(\['manager','lead','admin_ops'\]\.includes\(role\)\)[\s\S]*?assertProcessScope\(req\.user,minimal\.process_id/);
});

test('admin_ops cannot bypass process scope for special CVK reports', () => {
  const controller = read('controllers/productionTempManagementController.js');
  assert.doesNotMatch(controller, /Number\(data\.process_id\)\s*===\s*60006\s*\|\|/);
  assert.match(controller, /const canManage = await ProductionTemp\.canManageReport\(reportId, req\.user\.id, req\.user\?\.role === "admin"\)/);
});

test('admin_ops audit and deleted-report views are process-scoped', () => {
  const system = read('controllers/systemController.js');
  assert.match(system, /\['manager','lead','admin_ops'\]\.includes\(req\.user\.role\)/);
  assert.match(system, /\(\? IN \('manager','lead','admin_ops'\) AND EXISTS/);
  assert.match(system, /WHERE pr\.status='deleted' AND \$\{scope\}/);
  const routes = read('routes/systemRoutes.js');
  assert.match(routes, /role\('admin','admin_ops','manager','lead'\), permission\('AUDIT_VIEW'\), c\.getActivities/);
  assert.match(routes, /role\('admin','admin_ops','manager','lead'\), permission\('AUDIT_VIEW'\), c\.getDeletedReports/);
});

test('report version history respects pending vs approved view permissions and normalizes type', () => {
  const routes = read('routes/systemRoutes.js');
  const system = read('controllers/systemController.js');
  assert.ok(routes.includes("role === 'worker'"));
  assert.ok(routes.includes("type === 'temp' ? 'REPORT_PENDING_VIEW' : 'REPORT_APPROVED_VIEW'"));
  assert.ok(routes.includes('reportVersionPermission,'));
  assert.ok(routes.includes('c.getReportVersions'));
  assert.match(system, /String\(req\.query\?\.type\|\|''\)\.trim\(\)\.toLowerCase\(\)==='temp'\?'temp':'approved'/);
});

test('admin_ops can view version history only through process-scoped access checks', () => {
  const system = read('controllers/systemController.js');
  const routes = read('routes/systemRoutes.js');
  assert.match(system, /\(\? IN \('manager','lead','admin_ops'\) AND EXISTS/);
  assert.match(routes, /role\('admin', 'admin_ops', 'manager', 'lead', 'worker'\)/);
});

test('permission fallback uses valid role workspace routes', () => {
  const route = read('../frontend/src/routes/PermissionRoute.tsx');
  assert.match(route, /\['MASTER_VIEW','master\/machines'\]/);
  assert.match(route, /\['NOTIFICATION_VIEW','notifications'\]/);
});

test('admin_ops report action history is enabled with process-scope enforcement', () => {
  const routes = read('routes/productionTempRoutes.js');
  const controller = read('controllers/productionTempManagementController.js');
  assert.match(routes, /router\.get\("\/:id\/logs",authMiddleware,checkRole\("admin","admin_ops","manager","lead"\),permission\("AUDIT_VIEW"\),controller\.getReportActionLogs\)/);
  assert.match(controller, /exports\.getReportActionLogs[\s\S]*?ProductionTemp\.canManageReport\(reportId, req\.user\.id/);
});

test('admin_ops user lists, details, and Excel exports reveal only assigned-process names and IDs', () => {
  const users = read('controllers/userController.js');
  const extras = read('controllers/userControllerExtras.js');
  assert.match(users, /actor_scope\.process_id=wp2\.process_id/);
  assert.match(users, /actor_scope\.process_id=mp2\.process_id/);
  assert.match(users, /actor_scope\.process_id=wp2\.process_id[\s\S]*?WHERE u\.id=\? LIMIT 1/);
  // Excel import/export now loads assignments separately (TiDB-compatible) and
  // filters both worker and manager assignments against the actor's process scope.
  assert.match(extras, /async function loadUsersForTransfer[\s\S]*?SELECT wp\.worker_id AS target_id,wp\.process_id,p\.process_name/);
  assert.match(extras, /SELECT mp\.manager_id AS target_id,mp\.process_id,p\.process_name/);
  assert.match(extras, /if \(actorProcessIds && !actorProcessIds\.has\(processId\)\) continue/);
  assert.match(extras, /return assignments\.length > 0/);
});


test('admin_ops dashboard aggregates and process picker are limited to assigned processes', () => {
  const dashboard = read('controllers/dashboardController.js');
  const exportService = read('services/processExcelExportService.js');
  assert.match(dashboard, /function getScopeSql\(user[\s\S]*?manager_processes mp WHERE mp\.manager_id = \? AND mp\.process_id = \$\{alias\}\.process_id/);
  assert.match(dashboard, /processScope=req\.user\.role==="admin"\?\{clause:"",params:\[\]\}:\{clause:/);
  assert.match(exportService, /getActorProcessScope\(options\.actor\)/);
  assert.match(exportService, /scopeSql\(scope, 'p\.id'/);
});

test('admin_ops cannot edit pending reports or use edit-proposal endpoints', () => {
  const permissions = read('services/permissionService.js');
  const routes = read('routes/productionTempRoutes.js');
  assert.match(permissions, /'REPORT_PENDING_EDIT'/);
  assert.match(permissions, /if \(role === 'admin_ops'\)[\s\S]*?CAPABILITIES\.admin_ops\.has\(code\)/);
  assert.match(routes, /router\.put\("\/:id",authMiddleware,checkRole\("admin","admin_ops","manager","lead","worker"\)[\s\S]*?controller\.updateTempReport/);
  assert.match(routes, /const denyAdminOpsPendingEdit[\s\S]*?Admin vận hành không được sửa báo cáo đang chờ duyệt/);
  assert.ok(routes.includes('checkRole("admin","admin_ops","manager","lead","worker"),denyAdminOpsPendingEdit,validate'));
  assert.match(routes, /router\.get\("\/edit-proposals", authMiddleware, checkRole\("admin", "manager", "lead"\)/);
  assert.match(routes, /router\.post\("\/edit-proposals", authMiddleware, checkRole\("admin", "manager", "lead"\)/);
  assert.match(routes, /router\.post\("\/edit-proposals\/:id\/review", authMiddleware, checkRole\("manager","admin","lead"\)/);
});

test('admin_ops master data is read-only and process-bound reads remain scoped', () => {
  const routes = read('routes/adminMasterRoutes.js');
  const controller = read('controllers/adminMasterController.js');
  const permissions = read('services/permissionService.js');
  assert.match(routes, /MANAGEMENT_ROLES=\['admin','admin_ops','manager','lead'\]/);
  assert.match(routes, /req\.method==='GET'\?'MASTER_VIEW':'MASTER_EDIT'/);
  assert.match(permissions, /MASTER_EDIT/);
  assert.match(permissions, /CAPABILITIES\.admin_ops\.has\(code\)/);
  assert.match(controller, /const scope = await getActorProcessScope\(req\.user\)/);
  assert.match(controller, /scopeSql\(scope, 't\.process_id'/);
});
