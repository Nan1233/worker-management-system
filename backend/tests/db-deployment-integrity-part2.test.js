'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const {
  getCanonicalMigrationManifest,
  getExpectedSchemaMetadata,
  sortMigrationFilenames,
} = require('../services/migrationManifestService');
const {
  SCHEMA_STATUS,
  analyzeMigrationState,
  verifyDatabaseSchema,
  assertDatabaseSchemaReady,
  toSafeSchemaDiagnostics,
} = require('../services/databaseSchemaService');

const manifest = getCanonicalMigrationManifest();
const rowsFrom = (entries) => entries.map((entry) => ({
  migration_id: entry.filename,
  checksum: entry.checksum,
  applied_at: '2026-08-13T00:00:00Z',
}));

// 1-5 manifest
test('manifest discovers canonical migrations including post-Part2 remediation', () => {
  assert.equal(manifest.length, 25);
  assert.equal(manifest[0].version, 1);
  assert.equal(manifest.at(-1).version, 25);
});
test('migration filenames retain numeric ordering', () => {
  assert.deepEqual(sortMigrationFilenames(['10_x.sql','2_y.sql','001_a.sql']), ['001_a.sql','2_y.sql','10_x.sql']);
  assert.deepEqual(manifest.map((e) => e.version), Array.from({ length: 25 }, (_, i) => i + 1));
});
test('latest canonical migration is formula effective-range remediation 025', () => {
  const latest = getExpectedSchemaMetadata(manifest);
  assert.equal(latest.expectedSchemaVersion, 25);
  assert.equal(latest.expectedMigration, '025_formula_settings_effective_range_20260813.sql');
});
test('locked hashes 019-024 remain exact', () => {
  const expected = {
    19:'ff3a1591f9288910556e74a52dba53620b4ab368fe45874bc8f7826fc15deb33',
    20:'ba958fc0b8fc069d587ac684285fa6c78283619dc4602c278fb2002b862954b9',
    21:'461e39f69b34a9e87df2f9387d6c3db7faa0ecb7852e31d16aef053dc2f4cdf7',
    22:'8f7d148d32dfb7d0dcbafc4c93afa37424f55e536b39c811aeb991ba0bbdad05',
    23:'0f203c361afc20994b56da640c03a348450fbda8d6148021cac88c2fadd03c4d',
    24:'60b508fbb7e4b639486151cdcca4d7e36512ce67e018782aa7f5e566fdd7d3d2',
  };
  for (const [version, checksum] of Object.entries(expected)) {
    assert.equal(manifest.find((e) => e.version === Number(version)).checksum, checksum);
  }
});
test('version metadata has no manual 20260809 or SCHEMA_VERSION authority', () => {
  const src = read('config/version.js');
  assert.doesNotMatch(src, /20260809/);
  assert.doesNotMatch(src, /process\.env\.SCHEMA_VERSION/);
  assert.match(src, /getCanonicalMigrationManifest/);
});

// 6-10 ready/pending
test('exact migration ledger is READY', () => {
  const result = analyzeMigrationState(manifest, rowsFrom(manifest));
  assert.equal(result.status, SCHEMA_STATUS.READY);
  assert.equal(result.ready, true);
});
test('DB through 024 is MIGRATIONS_PENDING after F15 remediation', () => {
  const result = analyzeMigrationState(manifest, rowsFrom(manifest.slice(0, -1)));
  assert.equal(result.status, SCHEMA_STATUS.MIGRATIONS_PENDING);
  assert.deepEqual(result.missingMigrations.map((x) => x.version), [25]);
});
test('missing tail reports latest expected and actual safely', () => {
  const result = analyzeMigrationState(manifest, rowsFrom(manifest.slice(0, -1)));
  assert.equal(result.expectedLatest.filename, manifest.at(-1).filename);
  assert.equal(result.actualLatest.filename, manifest.at(-2).filename);
});
test('missing middle migration is invalid even when 024 exists', () => {
  const actual = rowsFrom(manifest.filter((entry) => entry.version !== 19));
  const result = analyzeMigrationState(manifest, actual);
  assert.equal(result.status, SCHEMA_STATUS.MIGRATION_STATE_INVALID);
  assert.ok(result.missingMigrations.some((x) => x.version === 19));
});
test('schema migrations table missing is treated as pending not database outage', async () => {
  const executor = { query: async () => { const e = new Error("Table 'x.schema_migrations' doesn't exist"); e.code='ER_NO_SUCH_TABLE'; throw e; } };
  const result = await verifyDatabaseSchema({ executor, manifest });
  assert.equal(result.status, SCHEMA_STATUS.MIGRATIONS_PENDING);
  assert.equal(result.ledgerMissing, true);
});

// 11-16 checksum/future/unavailable
test('wrong checksum is CHECKSUM_MISMATCH', () => {
  const actual = rowsFrom(manifest);
  actual[20] = { ...actual[20], checksum: '0'.repeat(64) };
  const result = analyzeMigrationState(manifest, actual);
  assert.equal(result.status, SCHEMA_STATUS.CHECKSUM_MISMATCH);
  assert.equal(result.checksumMismatches[0].filename, manifest[20].filename);
});
test('unknown 026 is UNEXPECTED_FUTURE_MIGRATION', () => {
  const actual = rowsFrom(manifest).concat({ migration_id:'026_future.sql', checksum:'a'.repeat(64), applied_at:null });
  assert.equal(analyzeMigrationState(manifest, actual).status, SCHEMA_STATUS.UNEXPECTED_FUTURE_MIGRATION);
});
test('unknown non-future migration record is invalid state', () => {
  const actual = rowsFrom(manifest).concat({ migration_id:'018_other_name.sql', checksum:'a'.repeat(64), applied_at:null });
  assert.equal(analyzeMigrationState(manifest, actual).status, SCHEMA_STATUS.MIGRATION_STATE_INVALID);
});
test('database query failure is DATABASE_UNAVAILABLE', async () => {
  const executor = { query: async () => { throw Object.assign(new Error('connection refused'), { code:'ECONNREFUSED' }); } };
  const result = await verifyDatabaseSchema({ executor, manifest });
  assert.equal(result.status, SCHEMA_STATUS.DATABASE_UNAVAILABLE);
});
test('assertDatabaseSchemaReady resolves for exact ledger', async () => {
  const executor = { query: async () => [rowsFrom(manifest)] };
  const result = await assertDatabaseSchemaReady({ executor, manifest });
  assert.equal(result.status, SCHEMA_STATUS.READY);
});
test('assertDatabaseSchemaReady rejects with stable DATABASE_SCHEMA_NOT_READY', async () => {
  const executor = { query: async () => [rowsFrom(manifest.slice(0,-1))] };
  await assert.rejects(() => assertDatabaseSchemaReady({ executor, manifest }), (e) => e.code === 'DATABASE_SCHEMA_NOT_READY' && e.schemaStatus === 'MIGRATIONS_PENDING');
});

// 17-20 safe diagnostics/CLI
test('safe diagnostics do not expose database credentials or migration contents', () => {
  const result = analyzeMigrationState(manifest, rowsFrom(manifest.slice(0,-1)));
  const d = toSafeSchemaDiagnostics(result);
  assert.deepEqual(Object.keys(d).sort(), ['actualMigration','expectedMigration','missingMigrations','schemaReady','status'].sort());
});
test('backend package exposes db:schema:verify command', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['db:schema:verify'], 'node scripts/verifyDatabaseSchema.js');
});
test('schema verify CLI exits non-zero for not-ready result', () => {
  const src = read('scripts/verifyDatabaseSchema.js');
  assert.match(src, /DATABASE_SCHEMA_NOT_READY/);
  assert.match(src, /process\.exitCode = 1/);
  assert.match(src, /Database schema READY/);
});
test('schema verify CLI prints only safe expected actual and missing metadata', () => {
  const src = read('scripts/verifyDatabaseSchema.js');
  assert.match(src, /Expected latest/);
  assert.match(src, /Actual latest/);
  assert.doesNotMatch(src, /DB_PASSWORD|DATABASE_URL|ssl.*key/i);
});

// 21-25 startup/worker
test('backend startup asserts schema before export queue initialization', () => {
  const src = read('server.js');
  const schema = src.indexOf('await assertDatabaseSchemaReady()');
  const queue = src.indexOf('await excelExportJobQueue.initialize()');
  assert.ok(schema > 0 && queue > schema);
});
test('backend startup asserts schema before app.listen', () => {
  const src = read('server.js');
  assert.ok(src.indexOf('await assertDatabaseSchemaReady()') < src.indexOf('server = app.listen'));
});
test('backend startup failure returns before listen and marks exit failure', () => {
  const src = read('server.js');
  assert.match(src, /process\.exitCode = 1;\s*return null;/s);
});
test('sync worker asserts schema before starting poll loop', () => {
  const src = read('worker.js');
  assert.ok(src.indexOf('await assertDatabaseSchemaReady()') < src.indexOf('while (!stopping)'));
});
test('backend and worker never auto-run db:migrate', () => {
  assert.doesNotMatch(read('server.js'), /runMigrations|db:migrate/);
  assert.doesNotMatch(read('worker.js'), /runMigrations|db:migrate/);
});

// 26-30 health
test('liveness remains database-independent', () => {
  const src = read('server.js');
  const block = src.slice(src.indexOf('app.get("/api/health/live"'), src.indexOf('async function readinessHandler'));
  assert.doesNotMatch(block, /verifyDatabaseSchema|SELECT 1|db\.promise/);
  assert.match(block, /status: "live"/);
});
test('readiness handler uses canonical schema verifier', () => {
  const src = read('server.js');
  assert.match(src, /const schema = await verifyDatabaseSchema\(\)/);
});
test('readiness returns 503 when schema is not ready', () => {
  const src = read('server.js');
  assert.match(src, /if \(!schema\.ready\)[\s\S]*res\.status\(503\)/);
});
test('legacy api health is compatibility alias to readiness semantics', () => {
  const src = read('server.js');
  assert.match(src, /app\.get\("\/api\/health\/ready", readinessHandler\)/);
  assert.match(src, /app\.get\("\/api\/health", readinessHandler\)/);
});
test('readiness metadata is schema-aware and secret-free', () => {
  const src = read('server.js');
  assert.match(src, /schemaReady/);
  assert.match(src, /expectedMigration/);
  assert.match(src, /actualMigration/);
  assert.doesNotMatch(src.slice(src.indexOf('async function readinessHandler'), src.indexOf('app.use("/api/mobile"')), /DB_PASSWORD|DATABASE_URL/);
});

// 31-34 reset ledger
test('reset final canonical ledger contains every canonical migration with exact checksum', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  for (const entry of manifest) {
    assert.ok(reset.includes(`('${entry.filename}', '${entry.checksum}')`), entry.filename);
  }
});
test('reset ledger has no placeholder or manual checksum in final canonical block', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  const block = reset.slice(reset.indexOf('FINAL CANONICAL MIGRATION LEDGER 001-025'));
  assert.doesNotMatch(block, /'UNKNOWN'|'manual-reset'|'placeholder'/i);
  for (const entry of manifest) assert.match(block, new RegExp(`'${entry.filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}', '[0-9a-f]{64}'`));
});
test('reset contains critical physical structures introduced by 019-024', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  for (const token of ['standard_version_id','training_percent_snapshot','exclude_kqd_from_tt_snapshot','machine_event_id','family_id','logical_duplicate_key','production_report_duplicate_locks']) {
    assert.ok(reset.includes(token), token);
  }
});
test('reset final ledger ends at current canonical migration', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  const block = reset.slice(reset.indexOf('FINAL CANONICAL MIGRATION LEDGER 001-025'));
  assert.match(block, /025_formula_settings_effective_range_20260813\.sql/);
});

// 35-40 runner/version/scope
test('migration runner reuses canonical migration manifest', () => {
  const src = read('scripts/runMigrations.js');
  assert.match(src, /getCanonicalMigrationManifest/);
  assert.doesNotMatch(src, /readdir\(MIGRATIONS_DIR\)/);
});
test('migration runner rejects unsafe ledger before applying new migrations', () => {
  const src = read('scripts/runMigrations.js');
  assert.match(src, /UNEXPECTED_FUTURE_MIGRATION/);
  assert.match(src, /MIGRATION_STATE_INVALID/);
  assert.match(src, /MIGRATION_CHECKSUM_MISMATCH/);
});
test('migration runner retains statement execution and applied-record ordering', () => {
  const src = read('scripts/runMigrations.js');
  assert.ok(src.indexOf('for (const statement of statements)') < src.indexOf("INSERT INTO schema_migrations"));
});
test('version endpoint metadata derives expected migration from canonical manifest', () => {
  const version = require('../config/version');
  assert.equal(version.schemaVersion, 25);
  assert.equal(version.expectedMigration, manifest.at(-1).filename);
  assert.equal(version.expectedMigrationChecksum, manifest.at(-1).checksum);
});
test('Part 2 schema safety remains independent of Render migration execution', () => {
  const server = read('server.js');
  const worker = read('worker.js');
  assert.match(server, /assertDatabaseSchemaReady/);
  assert.match(worker, /assertDatabaseSchemaReady/);
  assert.doesNotMatch(server, /db:migrate|runMigrations/);
  assert.doesNotMatch(worker, /db:migrate|runMigrations/);
});
test('F15 remediation migration 025 is canonical and no 026 is created', () => {
  const files = fs.readdirSync(path.join(root, 'migrations'));
  assert.ok(files.includes('025_formula_settings_effective_range_20260813.sql'));
  assert.equal(files.some((f) => /^026_/.test(f)), false);
});
