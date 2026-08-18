const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root,p),'utf8');
const json = (p) => JSON.parse(read(p));

for (const p of [
  '.gitignore','backend/.gitignore','frontend/.gitignore','desktop/.gitignore',
  '.github/workflows/ci.yml','.github/workflows/security-audit.yml','.github/workflows/zero-cost-validation.yml',
  'desktop/assets/offline.html','desktop/assets/icon.ico','desktop/assets/icon.png',
  'shared/excelSyncContract.cjs','shared/kqdPolicy.cjs','shared/kqdExclusionRegistry.json',
  'frontend/android/app/src/main/AndroidManifest.xml','frontend/android/app/src/main/java/com/ktchanoi/productioncontrol/MainActivity.java'
]) assert.ok(fs.existsSync(path.join(root,p)), `missing release path: ${p}`);

// Backend intentionally has no committed npm lockfile. Its CI/Render policy
// therefore uses npm install. Frontend and desktop remain lockfile-pinned.
for (const dir of ['frontend','desktop']) {
  const pkg=json(`${dir}/package.json`), lock=json(`${dir}/package-lock.json`);
  assert.ok(Number.isInteger(lock.lockfileVersion),`${dir} lockfileVersion missing`);
  assert.equal(lock.packages[''].name,pkg.name,`${dir} lock package name drift`);
  for (const section of ['dependencies','devDependencies']) {
    assert.deepEqual(lock.packages[''][section]||{},pkg[section]||{},`${dir} ${section} lock drift`);
  }
}

const backendPkg = json('backend/package.json');
assert.ok(backendPkg.name === 'backend', 'backend package manifest missing or invalid');
assert.ok(!fs.existsSync(path.join(root,'backend/package-lock.json')), 'backend lockfile policy drift: add the lockfile and switch CI/Render back to npm ci');

const rootPkg=json('package.json');
for (const [name,cmd] of Object.entries(rootPkg.scripts)) {
  const m=cmd.match(/^node\s+([^\s]+\.(?:c?js|mjs))/);
  if (m) assert.ok(fs.existsSync(path.join(root,m[1])),`root script ${name} points to missing ${m[1]}`);
}

assert.ok(!fs.existsSync(path.join(root,'backend/README.md')), 'stale duplicate desktop README must not live under backend');
assert.ok(!fs.existsSync(path.join(root,'backend/build-release.bat')), 'stale desktop release batch must not live under backend');
const releaseBat=read('desktop/build-release.bat');
assert.match(releaseBat,/npm ci/);
assert.match(releaseBat,/npm --prefix \.\.\/frontend ci/);
assert.match(releaseBat,/npm run dist:portable/);
assert.doesNotMatch(releaseBat,/dist:portable:fast/);

const zero=read('.github/workflows/zero-cost-validation.yml');
assert.match(zero,/workflow_dispatch:/);
assert.match(zero,/mysql:8\.4/);
assert.match(zero,/worker_management_staging_local/);
assert.doesNotMatch(zero,/onrender\.com|tidbcloud/i);
assert.doesNotMatch(zero,/TRUNCATE|DELETE\s+FROM/i);
for(const script of ['validate:zero-cost:seed','validate:zero-cost:security','validate:zero-cost:e2e','validate:zero-cost:perf','validate:zero-cost:excel','validate:zero-cost']) {
  assert.ok(rootPkg.scripts[script],`zero-cost workflow script missing: ${script}`);
}

const env=read('frontend/src/config/env.ts');
assert.match(env,/import\.meta\.env\.PROD/);
assert.match(env,/VITE_API_URL is required for production builds/);
assert.doesNotMatch(env,/worker-management-system-2-5jqv\.onrender\.com/);
const render=read('frontend/render.yaml');
assert.match(render,/key: VITE_API_URL/);
assert.match(render,/worker-management-system-2-5jqv\.onrender\.com\/api/);

const manifest=read('frontend/android/app/src/main/AndroidManifest.xml');
assert.match(manifest,/android:allowBackup="false"/);
assert.match(manifest,/android\.permission\.INTERNET/);
assert.doesNotMatch(manifest,/usesCleartextTraffic="true"/);
const cap=read('frontend/capacitor.config.ts');
assert.match(cap,/appId:\s*"com\.ktchanoi\.productioncontrol"/);
assert.match(cap,/webDir:\s*"dist"/);
const gradle=read('frontend/android/app/build.gradle');
assert.match(gradle,/applicationId "com\.ktchanoi\.productioncontrol"/);

const frontendPkg=json('frontend/package.json');
assert.equal(frontendPkg.scripts['build:native'],'node scripts/buildNative.cjs');
for (const name of ['android:sync','android:apk:debug','android:aab:release']) assert.match(frontendPkg.scripts[name],/build:native/);
assert.ok(fs.existsSync(path.join(root,'frontend/scripts/buildNative.cjs')));
const nativeBuild=read('frontend/scripts/buildNative.cjs');
assert.match(nativeBuild,/VITE_API_URL/);
assert.ok(nativeBuild.includes('https://'));

const desktop=json('desktop/package.json');
assert.equal(desktop.main,'electron/main.cjs');
assert.match(desktop.scripts['build:frontend'],/frontend run build:native/);
for (const r of desktop.build.extraResources[0].filter) assert.ok(fs.existsSync(path.join(root,'shared',r)),`missing desktop shared resource ${r}`);
for (const icon of [desktop.build.win.icon,desktop.build.mac.icon]) assert.ok(fs.existsSync(path.join(root,'desktop',icon)),`missing desktop icon ${icon}`);

console.log('[KTC] release consistency contract PASS');
