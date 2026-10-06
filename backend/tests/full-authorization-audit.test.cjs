const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

test('full authorization audit: sensitive routes have authentication + role/permission boundaries', () => {
  const routes = {
    users: read('routes/userRoutes.js'),
    workers: read('routes/workerRoutes.js'),
    production: read('routes/productionRoutes.js'),
    temp: read('routes/productionTempRoutes.js'),
    master: read('routes/adminMasterRoutes.js'),
    managerMaster: read('routes/managerMasterRoutes.js'),
    governance: read('routes/governanceRoutes.js'),
    permissions: read('routes/permissionRoutes.js'),
    system: read('routes/systemRoutes.js'),
    excelMaster: read('routes/excelMasterSyncRoutes.js'),
    export: read('routes/reportExportRoutes.js'),
    events: read('routes/machineProductionEventRoutes.js'),
  };

  assert.match(routes.users, /router\.use\(verifyToken,\s*checkRole\('admin','manager','lead'\)\)/);
  assert.match(routes.workers, /permission\("USER_VIEW"\)/);
  assert.match(routes.workers, /permission\("USER_EDIT"\)/);
  assert.match(routes.production, /REPORT_APPROVED_VIEW/);
  assert.match(routes.production, /REPORT_APPROVED_EDIT/);
  assert.match(routes.production, /REPORT_DELETE/);
  assert.match(routes.temp, /REPORT_APPROVE/);
  assert.match(routes.temp, /REPORT_PENDING_EDIT/);
  assert.match(routes.master, /masterPermission/);
  assert.match(routes.managerMaster, /permission\('MASTER_VIEW','MASTER_EDIT'\)/);
  assert.match(routes.governance, /permission\('GOVERNANCE_VIEW'\)/);
  assert.match(routes.permissions, /role\('admin'\),permission\('PERMISSION_MANAGE'\)/);
  assert.match(routes.system, /SYSTEM_HEALTH_VIEW/);
  assert.match(routes.system, /AUDIT_VIEW/);
  assert.match(routes.excelMaster, /permission\('EXCEL_MASTER_SYNC'\)/);
  assert.match(routes.export, /REPORT_EXPORT/);
  assert.match(routes.events, /REPORT_APPROVE/);
});

test('full authorization audit: no management master route bypasses functional permission', () => {
  const adminMaster = read('routes/adminMasterRoutes.js');
  const managerMaster = read('routes/managerMasterRoutes.js');
  assert.match(adminMaster, /managerMasterAccess,masterPermission/);
  assert.doesNotMatch(managerMaster, /if\(isManagerMaster\(req\)\) return next\(\)/);
  assert.match(adminMaster, /masterPermission/);
  assert.match(managerMaster, /permission\('MASTER_VIEW','MASTER_EDIT'\)/);
});

test('full authorization audit: actor process access covers worker + management roles', () => {
  const auth = read('services/processAuthorizationService.js');
  assert.match(auth, /async function assertActorProcessAccess/);
  assert.match(auth, /role === 'worker' \? 'worker_processes' : 'manager_processes'/);
  assert.match(auth, /if \(role === 'admin'\) return true/);
  assert.match(auth, /PROCESS_SCOPE_FORBIDDEN/);
});

test('full authorization audit: worker management reads/writes are process-scoped', () => {
  const worker = read('controllers/workerController.js');
  assert.match(worker, /manager_processes mp ON mp\.process_id=wp\.process_id AND mp\.manager_id=\?/);
  assert.match(worker, /assertUserManagementScope\(req\.user/);
  assert.match(worker, /WORKER_TRAINING_PERCENT_UPDATE/);
  assert.match(worker, /WORKER_PROFILE_VIEW/);
});

test('full authorization audit: master catalog APIs cannot read another process', () => {
  for (const file of ['routes/machineRoutes.js','routes/productStandardRoutes.js','routes/defectRoutes.js','routes/deductionRoutes.js']) {
    const src = read(file);
    assert.match(src, /assertActorProcessAccess/);
  }
});

test('full authorization audit: cron queue endpoint is secret-gated', () => {
  const route = read('routes/syncJobRoutes.js');
  const controller = read('controllers/syncJobController.js');
  assert.match(route, /router\.post\("\/process", controller\.process\)/);
  assert.match(controller, /SYNC_CRON_SECRET/);
  assert.match(controller, /x-cron-secret/);
  assert.match(controller, /status\(403\)/);
});

test('full authorization audit: period-lock authorization contracts are absent from active code', () => {
  const permissionService = read('services/permissionService.js');
  const governanceRoutes = read('routes/governanceRoutes.js');
  const governance = read('controllers/governanceController.js');
  assert.doesNotMatch(permissionService, /PERIOD_LOCK|PERIOD_UNLOCK/);
  assert.doesNotMatch(governanceRoutes, /period-locks|PERIOD_LOCK|PERIOD_UNLOCK/);
  assert.doesNotMatch(governance, /reporting_period_locks|REPORTING_PERIOD_LOCKED/);
});

test('full authorization audit: frontend never injects manager defaults into Lead', () => {
  const guard = fs.readFileSync(path.join(__dirname, '../../frontend/src/routes/PermissionRoute.tsx'), 'utf8');
  const layout = fs.readFileSync(path.join(__dirname, '../../frontend/src/layouts/ManagementLayout.tsx'), 'utf8');
  const router = fs.readFileSync(path.join(__dirname, '../../frontend/src/routes/AppRouter.tsx'), 'utf8');
  assert.doesNotMatch(guard, /temporaryManagerView|defaultPermissionsForRole\(['"]manager/);
  assert.doesNotMatch(layout, /temporaryManagerView|managerPermissions=defaultPermissionsForRole/);
  assert.match(layout, /item\.roles\.includes\(role\)&&can\(item\.permission\)/);
  assert.match(router, /<PrivateRoute allowedRoles=\{\["manager"\]\}><ManagementLayout role="manager"/);
});

test('full authorization audit: frontend permission catalog matches backend catalog', () => {
  const backend = read('services/permissionService.js');
  const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/security/permissions.ts'), 'utf8');
  const backendCodes = [...backend.matchAll(/\['([A-Z_]+)'/g)].map((m) => m[1]);
  const frontendCodes = [...frontend.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  for (const code of new Set(backendCodes)) assert.ok(frontendCodes.includes(code), `frontend missing ${code}`);
  assert.doesNotMatch(frontend, /FORMULA_VIEW|FORMULA_EDIT|PERIOD_LOCK|PERIOD_UNLOCK/);
});
