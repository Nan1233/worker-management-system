'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p=>fs.readFileSync(path.join(root,p),'utf8');
const json = p=>JSON.parse(read(p));
const exists = p=>fs.existsSync(path.join(root,p));
const { parseJsonc } = require('./lib/jsonc.cjs');

// Three independently deployed components use committed lockfiles.
for(const dir of ['backend','frontend','desktop']){
 const pkg=json(dir+'/package.json'),lock=json(dir+'/package-lock.json');
 assert.ok(Number.isInteger(lock.lockfileVersion),dir+' lockfile missing');
 assert.equal(lock.packages[''].name,pkg.name,dir+' name drift');
 for(const field of ['dependencies','devDependencies','optionalDependencies']){
  assert.deepEqual(lock.packages[''][field]||{},pkg[field]||{},dir+' '+field+' lock drift');
 }
}
const pkg=json('desktop/package.json');
assert.equal(pkg.main,'electron/launcher.cjs');
assert.ok(exists('desktop/'+pkg.main));
assert.equal(pkg.ktcDeploymentEnvironment,'test');
assert.equal(json('desktop/electron-builder.production.json').extraMetadata.ktcDeploymentEnvironment,'production');
for(const name of ['dist:win:test','dist:win:production','dist:portable']){
 assert.match(pkg.scripts[name],/--publish never/,name+' must not publish');
}
for(const item of pkg.build.extraResources||[]){
 for(const name of item.filter||[]){
  if(/[!*?]/.test(name))continue;
  assert.ok(exists(path.join('desktop',item.from,name)), 'Missing packaged resource: '+name);
 }
}
for(const icon of [pkg.build.win.icon,pkg.build.mac.icon])assert.ok(exists('desktop/'+icon));
const rootPkg=json('package.json');
for(const [name,cmd] of Object.entries(rootPkg.scripts||{})){
 const m=cmd.match(/^node\s+([^\s]+\.(?:c?js|mjs))/);
 if(m)assert.ok(exists(m[1]),'Missing root script '+name);
}
for(const [dir,testName,prodName] of [['frontend','ktc-fe-test','ktc-frontend'],['backend','ktc-be-test','ktc-backend']]){
 assert.equal(parseJsonc(read(dir+'/wrangler.jsonc')).name,testName);
 assert.equal(parseJsonc(read(dir+'/wrangler.production.jsonc')).name,prodName);
}
assert.ok(exists('.github/workflows/phase2-consolidated-safe.yml'));
assert.ok(exists('.github/workflows/phase5-release-readiness.yml'));
const manifest=read('frontend/android/app/src/main/AndroidManifest.xml');
assert.match(manifest,/android:allowBackup="false"/);
assert.match(manifest,/android\.permission\.INTERNET/);
assert.doesNotMatch(manifest,/usesCleartextTraffic="true"/);
const frontend=json('frontend/package.json');
assert.equal(frontend.scripts['build:native'],'node scripts/buildNative.cjs');
assert.ok(exists('frontend/scripts/buildNative.cjs'));
console.log('[KTC] Current release consistency source contract PASS (not deployment approval)');
