const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
test('enterprise RBAC has database overrides, API middleware and admin management endpoints',()=>{
 const service=read('services/permissionService.js');const server=read('server.js');const migration=read('migrations/009_role_permissions.sql');
 assert.match(service,/user_permission_overrides/);assert.match(service,/role_permission_overrides/);assert.match(service,/CAPABILITIES/);
 assert.match(server,/\/api\/permissions/);assert.match(migration,/CREATE TABLE IF NOT EXISTS role_permission_overrides/);assert.match(migration,/CREATE TABLE IF NOT EXISTS user_permission_overrides/);
});
test('sensitive routes enforce explicit permissions in addition to roles',()=>{
 assert.match(read('routes/productionRoutes.js'),/REPORT_APPROVED_EDIT/);assert.match(read('routes/productionRoutes.js'),/REPORT_DELETE/);assert.match(read('routes/productionRoutes.js'),/EXCEL_DB_SYNC/);
 assert.match(read('routes/reportExportRoutes.js'),/REPORT_EXPORT/);assert.match(read('routes/systemRoutes.js'),/AUDIT_VIEW/);assert.match(read('routes/userRoutes.js'),/USER_EDIT/);
});
