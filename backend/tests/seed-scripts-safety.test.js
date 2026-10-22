const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('GC defect seed never deletes and only touches defect_types of the GC process', () => {
  const src = read('scripts/ensureGcDefectMasterData.js');
  assert.doesNotMatch(src, /\b(DELETE|TRUNCATE|DROP|ALTER)\b/i);
  const writes = src.match(/`(?:UPDATE|INSERT INTO)[^`]*`|"UPDATE[^"]*"/g) || [];
  assert.ok(writes.length >= 3);
  for (const sql of writes) {
    assert.match(sql, /defect_types/, sql);
    if (/^.UPDATE/i.test(sql)) assert.match(sql, /WHERE (process_id=\?|id=\?)/i, sql);
  }
  assert.match(src, /ON DUPLICATE KEY UPDATE/i, 'upsert keeps repeated runs idempotent');
});

test('GC defect seed is skipped in the Cloudflare Worker unless explicitly enabled, and the entrypoint disables it', () => {
  assert.match(read('scripts/ensureGcDefectMasterData.js'), /if \(isCloudflareWorker && !isRuntimeBootstrapEnabled\) return;/);
  assert.match(read('cloudflare-entrypoint.js'), /KTC_RUN_MASTER_DATA_BOOTSTRAP = "false"/);
});

test('GC 2801-LT seed is read-only', () => {
  const src = read('scripts/ensureGcLong2801Lt.js');
  assert.doesNotMatch(src, /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|REPLACE)\b\s/i);
});

test('npm start runs seeds only; it never runs the migration runner', () => {
  const start = JSON.parse(read('package.json')).scripts.start;
  assert.match(start, /ensureGcDefectMasterData/);
  assert.doesNotMatch(start, /runPendingMigrations|db:migrate|runBuildMigrations/);
});
