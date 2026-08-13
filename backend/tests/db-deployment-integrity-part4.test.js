'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const projectRoot = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readProject = (p) => fs.readFileSync(path.join(projectRoot, p), 'utf8');
const { getCanonicalMigrationManifest, getExpectedSchemaMetadata } = require('../services/migrationManifestService');
const { analyzeMigrationState, SCHEMA_STATUS } = require('../services/databaseSchemaService');
const { runDatabaseRelease } = require('../services/databaseReleaseService');

const manifest = getCanonicalMigrationManifest();
const rows = manifest.map((entry) => ({ migration_id: entry.filename, checksum: entry.checksum, applied_at: '2026-08-13T00:00:00Z' }));

// 1-6 canonical schema authority

test('canonical migration manifest remains the only expected-schema authority', () => {
  assert.equal(manifest.length, 25);
  assert.equal(getExpectedSchemaMetadata(manifest).expectedMigration, '025_formula_settings_effective_range_20260813.sql');
  assert.match(read('config/version.js'), /getCanonicalMigrationManifest/);
  assert.doesNotMatch(read('config/version.js'), /20260809|SCHEMA_VERSION/);
});

test('full-set verifier rejects missing-middle migration', () => {
  const actual = rows.filter((_, i) => i !== 18);
  assert.equal(analyzeMigrationState(manifest, actual).status, SCHEMA_STATUS.MIGRATION_STATE_INVALID);
});

test('full-set verifier rejects unknown future 026', () => {
  const actual = rows.concat({ migration_id: '026_future.sql', checksum: 'f'.repeat(64), applied_at: null });
  assert.equal(analyzeMigrationState(manifest, actual).status, SCHEMA_STATUS.UNEXPECTED_FUTURE_MIGRATION);
});

test('full-set verifier rejects checksum mismatch', () => {
  const actual = rows.map((row) => ({ ...row }));
  actual[20].checksum = '0'.repeat(64);
  assert.equal(analyzeMigrationState(manifest, actual).status, SCHEMA_STATUS.CHECKSUM_MISMATCH);
});

test('source 025 with DB 024 is not READY', () => {
  assert.equal(analyzeMigrationState(manifest, rows.slice(0, -1)).status, SCHEMA_STATUS.MIGRATIONS_PENDING);
});

test('exact 001-025 ledger is READY', () => {
  assert.equal(analyzeMigrationState(manifest, rows).status, SCHEMA_STATUS.READY);
});

// 7-11 startup/health/worker

test('backend direct node startup contains schema gate before listen', () => {
  const src = read('server.js');
  assert.ok(src.indexOf('await assertDatabaseSchemaReady()') < src.indexOf('server = app.listen'));
  assert.doesNotMatch(src, /runMigrations|db:migrate|db:release/);
});

test('worker direct node startup contains schema gate before poll loop', () => {
  const src = read('worker.js');
  assert.ok(src.indexOf('await assertDatabaseSchemaReady()') < src.indexOf('while (!stopping)'));
  assert.doesNotMatch(src, /runMigrations|db:migrate|db:release/);
});

test('liveness remains independent from schema readiness', () => {
  const src = read('server.js');
  const live = src.slice(src.indexOf('app.get("/api/health/live"'), src.indexOf('async function readinessHandler'));
  assert.doesNotMatch(live, /verifyDatabaseSchema|db\.promise|schema_migrations/);
});

test('ready and legacy health both use schema-aware readiness', () => {
  const src = read('server.js');
  assert.match(src, /app\.get\("\/api\/health\/ready", readinessHandler\)/);
  assert.match(src, /app\.get\("\/api\/health", readinessHandler\)/);
  assert.match(src, /if \(!schema\.ready\)[\s\S]*res\.status\(503\)/);
});

test('schema diagnostics remain secret-free', () => {
  const src = read('server.js');
  const block = src.slice(src.indexOf('async function readinessHandler'), src.indexOf('app.use("/api/mobile"'));
  assert.match(block, /expectedMigration|actualMigration|schemaReady/);
  assert.doesNotMatch(block, /DB_PASSWORD|DATABASE_URL|DB_USER/);
});

// 12-17 migration/seed/release separation

test('db:migrate is schema-only and does not seed master data', () => {
  const src = read('scripts/runMigrations.js');
  assert.doesNotMatch(src, /runMasterSeed|seedMaster|db:seed-master/);
});

test('db:release performs exactly migrate then schema verify', () => {
  const src = read('services/databaseReleaseService.js');
  assert.match(src, /name: 'db:migrate'/);
  assert.match(src, /name: 'db:schema:verify'/);
  assert.ok(src.indexOf("name: 'db:migrate'") < src.indexOf("name: 'db:schema:verify'"));
  assert.doesNotMatch(src, /seed|server\.js|worker\.js/i);
});

test('db:seed-master remains explicit package command only', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['db:seed-master'], 'node scripts/runMasterSeed.js');
  const refs = readProject('backend/package.json') + readProject('backend/render.yaml') + readProject('package.json');
  assert.doesNotMatch(readProject('backend/render.yaml'), /db:seed-master|runMasterSeed/);
  assert.match(refs, /db:seed-master/);
});

test('release stops immediately when migration fails', () => {
  const calls = [];
  assert.throws(() => runDatabaseRelease({ runStep(step) { calls.push(step.name); return { status: step.name === 'db:migrate' ? 2 : 0 }; } }), /Database release stopped/);
  assert.deepEqual(calls, ['db:migrate']);
});

test('release fails when post-migration schema verification fails', () => {
  const calls = [];
  assert.throws(() => runDatabaseRelease({ runStep(step) { calls.push(step.name); return { status: step.name === 'db:schema:verify' ? 3 : 0 }; } }), /Database release stopped/);
  assert.deepEqual(calls, ['db:migrate', 'db:schema:verify']);
});

test('migration ledger success row is written after statement loop', () => {
  const src = read('scripts/runMigrations.js');
  assert.ok(src.indexOf('for (const statement of statements)') < src.indexOf('INSERT INTO schema_migrations'));
});

// 18-23 Render/repository callers

test('Render backend has exactly one preDeploy database release command', () => {
  const render = read('render.yaml');
  assert.equal((render.match(/preDeployCommand:/g) || []).length, 1);
  assert.match(render, /preDeployCommand:\s*npm run db:release/);
});

test('Render worker has no migration or release command', () => {
  const render = read('render.yaml');
  const worker = render.slice(render.indexOf('- type: worker'));
  assert.doesNotMatch(worker, /preDeployCommand|db:migrate|db:release|release:db/);
});

test('Render health path is explicit readiness endpoint', () => {
  assert.match(read('render.yaml'), /healthCheckPath:\s*\/api\/health\/ready/);
});

test('Render build retains blocking verify gate', () => {
  const render = read('render.yaml');
  assert.match(render, /buildCommand:\s*npm ci && npm run verify && npm prune --omit=dev/);
  assert.doesNotMatch(render, /\|\|\s*true|continue-on-error/i);
});

test('root fallback release command points to backend db:release', () => {
  const pkg = JSON.parse(readProject('package.json'));
  assert.equal(pkg.scripts['release:db'], 'npm --prefix backend run db:release');
});

test('legacy patch operator instructions no longer bypass schema verification with demo-schema', () => {
  const src = readProject('APPLY_TO_PROJECT.cmd');
  assert.match(src, /npm run release:db/);
  assert.doesNotMatch(src, /echo\s+npm --prefix backend run db:migrate/i);
  assert.match(src, /db:demo-schema is a legacy\/manual development helper/i);
});

// 24-29 runbook/cutover/rollback

test('runbook requires verified backup and stop-on-failure', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /backup:verify/);
  for (const phrase of ['tests/build fail','backup verification fails','db:migrate','db:schema:verify','/api/health/ready','critical post-deploy smoke fails']) assert.ok(doc.includes(phrase), phrase);
});

test('runbook documents 023 one-time relogin and pre-F11 backend incompatibility', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /one-time relogin/i);
  assert.match(doc, /pre-F11 backend/i);
  assert.match(doc, /familyless sessions/i);
});

test('runbook documents old Electron incompatibility and successor-token requirement', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /Old packaged Electron clients/i);
  assert.match(doc, /successor refresh tokens/i);
});

test('runbook documents duplicate challenge old-client cutover', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /duplicate_confirmation_token/);
  assert.match(doc, /force_create=true/);
});

test('runbook documents already-open browser tab reload/relogin behavior', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /Already-open browser tabs/i);
  assert.match(doc, /reload the page\/sign in again/i);
});

test('runbook documents strict rollback source-vs-DB matrix and no down migrations', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /023 verifier-aware source \| 024\/025 \| BLOCK/);
  assert.match(doc, /no automatic down-migration framework/i);
});

// 30-34 migration/reset/hash

test('locked migrations 019-024 remain exact while remediation owns 025', () => {
  const expected = {
    19:'ff3a1591f9288910556e74a52dba53620b4ab368fe45874bc8f7826fc15deb33',
    20:'ba958fc0b8fc069d587ac684285fa6c78283619dc4602c278fb2002b862954b9',
    21:'461e39f69b34a9e87df2f9387d6c3db7faa0ecb7852e31d16aef053dc2f4cdf7',
    22:'8f7d148d32dfb7d0dcbafc4c93afa37424f55e536b39c811aeb991ba0bbdad05',
    23:'0f203c361afc20994b56da640c03a348450fbda8d6148021cac88c2fadd03c4d',
    24:'60b508fbb7e4b639486151cdcca4d7e36512ce67e018782aa7f5e566fdd7d3d2',
  };
  for (const [v, hash] of Object.entries(expected)) assert.equal(manifest.find((x) => x.version === Number(v)).checksum, hash);
  assert.ok(fs.readdirSync(path.join(root, 'migrations')).includes('025_formula_settings_effective_range_20260813.sql'));
});

test('reset ledger still contains exact canonical hashes', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  for (const entry of manifest) assert.ok(reset.includes(`('${entry.filename}', '${entry.checksum}')`), entry.filename);
});

test('reset retains critical hardened physical structures', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  for (const token of ['standard_version_id','training_percent_snapshot','exclude_kqd_from_tt_snapshot','machine_event_id','family_id','logical_duplicate_key','production_report_duplicate_locks']) assert.ok(reset.includes(token), token);
});

test('migration runner and verifier share canonical manifest service', () => {
  assert.match(read('scripts/runMigrations.js'), /getCanonicalMigrationManifest/);
  assert.match(read('services/databaseSchemaService.js'), /getCanonicalMigrationManifest/);
});

test('migration 023 and 024 rerun guidance remains present in runbook', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /\| 023 \| RERUN_SAFE[\s\S]*semantic review required/i);
  assert.match(doc, /\| 024 \| RERUN_SAFE/i);
});

// 35-40 F15 runtime-DDL bypass sweep and blocker

test('audit service no longer creates or alters schema on request paths', () => {
  const src = read('services/auditService.js');
  const ensure = src.slice(src.indexOf('async function ensureSchema'), src.indexOf('async function logActivity'));
  assert.match(ensure, /Schema creation belongs exclusively to canonical migrations\/release/);
  assert.doesNotMatch(ensure, /CREATE TABLE|ALTER TABLE|INFORMATION_SCHEMA/i);
});

test('governance service no longer creates schema on request paths', () => {
  const src = read('services/governanceSchemaService.js');
  assert.match(src, /Schema creation belongs exclusively to canonical migrations\/release/);
  assert.doesNotMatch(src, /CREATE TABLE|ALTER TABLE|INFORMATION_SCHEMA/i);
});

test('audit/governance compatibility ensureSchema paths perform no database schema mutation', () => {
  const src = read('services/auditService.js') + read('services/governanceSchemaService.js');
  assert.doesNotMatch(src, /CREATE TABLE|ALTER TABLE|INFORMATION_SCHEMA/i);
});

test('formula settings runtime path no longer mutates schema', () => {
  const src = read('services/formulaSettingsService.js');
  assert.doesNotMatch(src, /CREATE TABLE|ALTER TABLE|ADD COLUMN|CREATE INDEX/i);
});

test('canonical migration 025 defines formula effective range without modifying migration 007', () => {
  const m25 = read('migrations/025_formula_settings_effective_range_20260813.sql');
  assert.match(m25, /effective_from DATE NULL/i);
  assert.match(m25, /effective_to DATE NULL/i);
  const m7 = read('migrations/007_production_formula_settings.sql');
  assert.doesNotMatch(m7, /effective_from|effective_to/i);
});

test('reset schema contains canonical formula effective-range columns', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  const start = reset.indexOf('CREATE TABLE IF NOT EXISTS production_formula_settings');
  const end = reset.indexOf(';', start);
  const block = reset.slice(start, end);
  assert.match(block, /effective_from DATE NULL/i);
  assert.match(block, /effective_to DATE NULL/i);
});
