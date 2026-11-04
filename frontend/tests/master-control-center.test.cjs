const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function loadTs(rel, stubs = {}) {
  const { outputText } = ts.transpileModule(read(rel), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } });
  const mod = { exports: {} };
  const req = (name) => (name in stubs ? stubs[name] : require(name));
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, req);
  return mod.exports;
}

const iconStub = new Proxy({}, { get: () => () => null });
const nav = loadTs('frontend/src/pages/masterControl/masterControlNav.ts', { 'lucide-react': iconStub });

test('Master Control route is declared once at /admin/master-control behind PrivateRoute(admin)', () => {
  const router = read('frontend/src/routes/AppRouter.tsx');
  const matches = router.match(/path="\/admin\/master-control"/g) || [];
  assert.equal(matches.length, 1, 'no duplicate route');
  assert.match(router, /<Route path="\/admin\/master-control" element=\{<PrivateRoute allowedRoles=\{\["admin"\]\}><MasterControlLayout\/><\/PrivateRoute>\}>/);
  assert.match(router, /<Route path="\*" element=\{<Navigate to="\/admin\/master-control" replace\/>\}\/>/, 'unknown sub-routes fall back to overview');
  assert.equal(nav.MASTER_CONTROL_BASE, '/admin/master-control');
});

test('every sidebar module has a real route and the sidebar lists the four requested groups', () => {
  const router = read('frontend/src/routes/AppRouter.tsx');
  const block = router.slice(router.indexOf('path="/admin/master-control"'), router.indexOf('<Route path="/manager"'));
  assert.deepEqual(nav.MASTER_CONTROL_GROUPS.map((g) => g.label), ['OVERVIEW', 'MANAGEMENT', 'SYSTEM', 'OPERATIONS']);
  for (const module of nav.MASTER_CONTROL_MODULES) {
    if (module.path === '') assert.match(block, /<Route index element=/);
    else assert.match(block, new RegExp(`<Route path="${module.path}" element=`), module.path);
  }
  const labels = nav.MASTER_CONTROL_MODULES.map((m) => m.label);
  for (const label of ['Overview Dashboard', 'Users & Accounts', 'Roles & Permissions', 'Organization', 'Master Data', 'System Configuration', 'Page Builder', 'Component Registry', 'Database Explorer', 'System Health', 'Backup & Recovery', 'Audit Center']) assert.ok(labels.includes(label), label);
  // unimplemented modules are explicitly marked, never presented as working
  assert.deepEqual(nav.MASTER_CONTROL_MODULES.filter((m) => m.status === 'coming_soon').map((m) => m.path).sort(), ['organization', 'page-builder']);
});

test('breadcrumb resolves the current module from the URL (direct entry / refresh)', () => {
  assert.equal(nav.moduleForPath('/admin/master-control').label, 'Overview Dashboard');
  assert.equal(nav.moduleForPath('/admin/master-control/users/42').label, 'Users & Accounts');
  assert.equal(nav.moduleForPath('/admin/master-control/audit').label, 'Audit Center');
  assert.equal(nav.moduleForPath('/admin/master-control/unknown'), undefined);
  assert.equal(nav.controlPath('health'), '/admin/master-control/health');
});

test('Admin sidebar links to Master Control Center and no hard-coded "healthy" status remains', () => {
  const layout = read('frontend/src/layouts/AdminLayout.tsx');
  assert.match(layout, /\{label:"Master Control Center",path:"master-control",icon:CircleGauge/);
  assert.doesNotMatch(layout, /Hệ thống đang hoạt động/);
  assert.doesNotMatch(read('frontend/src/pages/admin/Dashboard.tsx'), /Hệ thống hoạt động/);
  for (const file of fs.readdirSync(path.join(root, 'frontend/src/pages/masterControl'))) {
    const source = read(`frontend/src/pages/masterControl/${file}`);
    assert.doesNotMatch(source, /System Healthy|mockData|faker|Math\.random/, `${file} must not fake data`);
  }
});

test('layout asks the backend before rendering any module (direct URL by a non-admin is denied)', () => {
  const layout = read('frontend/src/layouts/MasterControlLayout.tsx');
  assert.match(layout, /masterControlApi\.session\(\)/);
  assert.match(layout, /access\.status === "granted" \? <Outlet \/> : null/);
  assert.match(layout, /isForbidden\(error\) \? \{ status: "denied" \}/);
  assert.match(layout, /aria-label="Breadcrumb"/);
});

test('frontend client calls exactly the backend control endpoints', () => {
  const client = read('frontend/src/services/masterControlService.ts');
  const backend = read('backend/routes/adminControlRoutes.js');
  const used = [...client.matchAll(/api\.(get|patch)\(`?"?\/admin\/control([^"`?]*)/g)].map((m) => [m[1], m[2].replace(/\$\{[^}]+\}/g, ':param')]);
  assert.ok(used.length >= 10);
  for (const [method, url] of used) {
    const pattern = url.replace(/:param/g, ':(id|name)');
    assert.match(backend, new RegExp(`router\\.${method}\\('${pattern.replace(/\//g, '\\/')}'`), `${method.toUpperCase()} ${url}`);
  }
});

test('database explorer UI keeps the SQL console disabled; backup page offers no restore button', () => {
  const db = read('frontend/src/pages/masterControl/Database.tsx');
  assert.doesNotMatch(db, /<textarea|runQuery|executeSql/i);
  assert.match(db, /SQL console đang <strong>tắt<\/strong>/);
  const backup = read('frontend/src/pages/masterControl/Backup.tsx');
  assert.doesNotMatch(backup, /<button/);
});
