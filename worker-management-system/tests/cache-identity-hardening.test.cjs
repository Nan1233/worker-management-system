const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('session cache is namespaced by authenticated identity and session id', () => {
  const cache = read('frontend/src/services/sessionCache.ts');
  const auth = read('frontend/src/utils/authStorage.ts');
  assert.match(cache, /CACHE_SCOPE_KEY = "ktc-session-cache-scope"/);
  assert.match(cache, /function scopedKey\(key: string\)/);
  assert.match(cache, /generationAtStart !== cacheGeneration \|\| scoped !== scopedKey\(key\)/);
  assert.match(cache, /export function setSessionCacheScope/);
  assert.match(auth, /`u\$\{Number\(user\.id\) \|\| 0\}`/);
  assert.match(auth, /`w\$\{Number\(user\.worker_id\) \|\| 0\}`/);
  assert.match(auth, /`c\$\{String\(user\.worker_code/);
  assert.match(auth, /`s\$\{getAuthSessionId\(\) \|\| "-"\}`/);
  assert.match(auth, /setSessionCacheScope\(cacheScopeForUser\(user\)\)/);
});

test('worker profile response is rejected if it belongs to another authenticated worker', () => {
  const source = read('frontend/src/services/workerService.ts');
  assert.match(source, /wrongUser/);
  assert.match(source, /wrongCode/);
  assert.match(source, /WORKER_PROFILE_IDENTITY_MISMATCH/);
  assert.match(source, /clearSessionCache\("current-worker:"\)/);
});

test('master data mutation advances browser-wide cache epoch', () => {
  const cache = read('frontend/src/services/masterDataCache.ts');
  const page = read('frontend/src/pages/admin/MasterData.tsx');
  assert.match(cache, /MASTER_DATA_EPOCH_KEY = "ktcMasterDataEpoch"/);
  assert.match(cache, /epochKey\(`machines:\$\{processId\}`\)/);
  assert.match(cache, /export function bumpMasterDataEpoch/);
  assert.match(page, /bumpMasterDataEpoch\(\)/);
});

test('user assignment edits invalidate worker and permission client caches', () => {
  const page = read('frontend/src/pages/admin/MasterData.tsx');
  assert.match(page, /clearSessionCache\('current-worker:'\)/);
  assert.match(page, /clearPermissionClientCache\(\)/);
  assert.match(page, /invalidateChangedResource\(\)/);
});
