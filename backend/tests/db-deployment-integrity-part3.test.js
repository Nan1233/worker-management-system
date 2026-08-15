'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const projectRoot = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const readProject = (p) => fs.readFileSync(path.join(projectRoot, p), 'utf8');
const { runDatabaseRelease, RELEASE_STEPS } = require('../services/databaseReleaseService');
const { getCanonicalMigrationManifest } = require('../services/migrationManifestService');

const manifest = getCanonicalMigrationManifest();

// 1-7 release ordering / single migrator
test('backend exposes canonical db:release and root exposes release:db fallback', () => {
  const backendPkg = JSON.parse(read('package.json'));
  const rootPkg = JSON.parse(readProject('package.json'));
  assert.equal(backendPkg.scripts['db:release'], 'node scripts/releaseDatabase.js');
  assert.equal(rootPkg.scripts['release:db'], 'npm --prefix backend run db:release');
});

test('database release executes migrate before schema verify', () => {
  assert.deepEqual(RELEASE_STEPS.map((s) => s.name), ['db:migrate', 'db:schema:verify']);
});

test('database release succeeds only after both ordered steps succeed', () => {
  const calls = [];
  const result = runDatabaseRelease({ runStep(step) { calls.push(step.name); return { status: 0 }; } });
  assert.deepEqual(calls, ['db:migrate', 'db:schema:verify']);
  assert.deepEqual([...result.completed], calls);
});

test('migration failure blocks schema verification and exits release path', () => {
  const calls = [];
  assert.throws(() => runDatabaseRelease({ runStep(step) {
    calls.push(step.name);
    return { status: step.name === 'db:migrate' ? 7 : 0 };
  }}), (e) => e.code === 'DATABASE_MIGRATION_FAILED');
  assert.deepEqual(calls, ['db:migrate']);
});

test('schema verify failure makes database release fail', () => {
  const calls = [];
  assert.throws(() => runDatabaseRelease({ runStep(step) {
    calls.push(step.name);
    return { status: step.name === 'db:schema:verify' ? 9 : 0 };
  }}), (e) => e.code === 'DATABASE_SCHEMA_VERIFY_FAILED');
  assert.deepEqual(calls, ['db:migrate', 'db:schema:verify']);
});

test('release command never starts backend or worker', () => {
  const src = read('services/databaseReleaseService.js') + read('scripts/releaseDatabase.js');
  assert.doesNotMatch(src, /server\.js|worker\.js|npm\s+start|npm\s+run\s+worker/);
});


test('deployment migration path is schema-only and never auto-runs master seed', () => {
  const migrate = read('scripts/runMigrations.js');
  const release = read('services/databaseReleaseService.js') + read('scripts/releaseDatabase.js');
  assert.doesNotMatch(migrate, /runMasterSeed|db:seed-master/);
  assert.doesNotMatch(release, /runMasterSeed|db:seed-master/);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['db:seed-master'], 'node scripts/runMasterSeed.js');
});

test('backend and worker startup remain verify-only and never migrate', () => {
  for (const file of ['server.js','worker.js']) {
    const src = read(file);
    assert.match(src, /assertDatabaseSchemaReady/);
    assert.doesNotMatch(src, /db:migrate|runMigrations|releaseDatabase/);
  }
});

// 8-12 Render / build gate
test('Render backend uses one preDeploy database release command', () => {
  const render = read('render.yaml');
  const webBlock = render.slice(render.indexOf('- type: web'), render.indexOf('- type: worker'));
  assert.match(webBlock, /preDeployCommand:\s*npm run db:release/);
  assert.equal((render.match(/preDeployCommand:/g) || []).length, 1);
});

test('Render worker is not a migration executor', () => {
  const render = read('render.yaml');
  const worker = render.slice(render.indexOf('- type: worker'));
  assert.doesNotMatch(worker, /preDeployCommand|db:migrate|db:release/);
  assert.match(worker, /startCommand:\s*npm run worker/);
});

test('Render deployment health path is explicit readiness endpoint', () => {
  const render = read('render.yaml');
  assert.match(render, /healthCheckPath:\s*\/api\/health\/ready/);
});

test('Render build keeps verify as a blocking command before production prune', () => {
  const render = read('render.yaml');
  assert.match(render, /buildCommand:\s*npm ci && npm run verify && npm prune --omit=dev/);
  assert.doesNotMatch(render, /\|\|\s*true|continue-on-error/i);
});

test('migration runtime dependency mysql2 is a production dependency', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.dependencies.mysql2);
  assert.equal(pkg.devDependencies?.mysql2, undefined);
});

// 13-18 migration failure / rerun contract
test('migration ledger record is written only after all statements finish', () => {
  const src = read('scripts/runMigrations.js');
  assert.ok(src.indexOf('for (const statement of statements)') < src.indexOf("INSERT INTO schema_migrations"));
});

test('migration failure is non-zero and never marks migration successful in catch path', () => {
  const src = read('scripts/runMigrations.js');
  assert.match(src, /MIGRATION FAILED/);
  assert.match(src, /process\.exitCode = 1/);
  const catchBlock = src.slice(src.indexOf("run()\n  .catch"));
  assert.doesNotMatch(catchBlock, /INSERT INTO schema_migrations/);
});

test('migrations 019-022 remain additive rerun-tolerant SQL', () => {
  for (const version of [19,20,21,22]) {
    const entry = manifest.find((e) => e.version === version);
    const sql = read(`migrations/${entry.filename}`);
    assert.match(sql, /IF NOT EXISTS/i, entry.filename);
  }
});

test('migration 023 legacy-session revoke DML is idempotent for already-revoked rows', () => {
  const sql = read('migrations/023_refresh_session_rotation_20260813.sql');
  assert.match(sql, /WHERE family_id IS NULL\s+AND revoked_at IS NULL/s);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/i);
});

test('migration 024 rerun path uses IF NOT EXISTS for additive objects', () => {
  const sql = read('migrations/024_logical_duplicate_report_lock_20260813.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS/i);
});

test('deployment runbook explicitly does not claim transactional DDL rollback', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /DDL must not be treated as ordinary rollback-safe DML/i);
  assert.match(doc, /stop deployment/i);
  assert.match(doc, /do not mark the migration applied manually/i);
});

// 19-25 cutover / rollback / runbook
test('runbook documents 023 one-time relogin and old backend incompatibility', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /Migration 023 invalidates pre-F11 familyless refresh sessions/i);
  assert.match(doc, /one-time relogin/i);
  assert.match(doc, /pre-F11 backend/i);
});

test('runbook documents old Electron successor-token compatibility risk', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /Old packaged Electron clients/i);
  assert.match(doc, /successor refresh tokens/i);
});

test('runbook documents duplicate challenge old-client incompatibility', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /force_create=true/);
  assert.match(doc, /duplicate_confirmation_token/);
});

test('runbook contains strict rollback source-vs-DB compatibility matrix', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /023 verifier-aware source \| 024\/025 \| BLOCK/);
  assert.match(doc, /new F11 source \| pre-023 \| BLOCK/);
  assert.match(doc, /not automatically valid across a migration boundary/i);
});

test('runbook has no automatic down-migration promise', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /no automatic down-migration framework/i);
  assert.match(doc, /forward fix/i);
  assert.match(doc, /restore a verified DB backup/i);
});

test('runbook requires verified backup and explicit stop conditions', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /backup:verify/);
  for (const phrase of ['backup verification fails','db:migrate','db:schema:verify','/api/health/ready','critical post-deploy smoke fails']) {
    assert.ok(doc.includes(phrase), phrase);
  }
});

test('runbook smoke checklist covers login save approved read Excel and refresh', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  for (const phrase of ['manager login','worker login','session refresh','worker report save','approved report read','Excel basic']) {
    assert.match(doc, new RegExp(phrase, 'i'));
  }
});

// 26-30 scope/migrations/client source
test('current frontend contains duplicate challenge-capable client contract', () => {
  const processPage = readProject('frontend/src/pages/worker/ProcessPage.tsx');
  const duplicateFlow = readProject('frontend/src/pages/worker/useDuplicateReportFlow.ts');
  assert.match(processPage, /useDuplicateReportFlow/);
  assert.match(duplicateFlow, /duplicate_confirmation_token/);
  assert.match(duplicateFlow, /force_create:\s*true/);
});

test('current frontend contains F11 rotation-aware refresh successor handling', () => {
  const api = readProject('frontend/src/services/api.ts');
  assert.match(api, /ELECTRON_REFRESH_TOKEN_SUCCESSOR_MISSING/);
  assert.match(api, /setRefreshToken\(response\.data\.refreshToken\)/);
});

test('Render predeploy runtime support remains explicitly unverified in runbook', () => {
  const doc = readProject('docs/DEPLOYMENT_RUNBOOK.md');
  assert.match(doc, /RENDER_PREDEPLOY_RUNTIME_SUPPORT/);
  assert.match(doc, /operational verification item/i);
});

test('Part3 locked migrations 019-024 remain byte-identical; later remediation may add 025', () => {
  const expected = {
    19:'ff3a1591f9288910556e74a52dba53620b4ab368fe45874bc8f7826fc15deb33',
    20:'ba958fc0b8fc069d587ac684285fa6c78283619dc4602c278fb2002b862954b9',
    21:'461e39f69b34a9e87df2f9387d6c3db7faa0ecb7852e31d16aef053dc2f4cdf7',
    22:'8f7d148d32dfb7d0dcbafc4c93afa37424f55e536b39c811aeb991ba0bbdad05',
    23:'2c9831b08a21d009888a6bd55710348669caca32936c550660956d38f4b0a2a3',
    24:'60b508fbb7e4b639486151cdcca4d7e36512ce67e018782aa7f5e566fdd7d3d2',
  };
  for (const [v, hash] of Object.entries(expected)) assert.equal(manifest.find((e)=>e.version===Number(v)).checksum, hash);
  assert.ok(fs.readdirSync(path.join(root,'migrations')).includes('025_formula_settings_effective_range_20260813.sql'));
});

test('release/runbook changes do not weaken Part 2 startup or readiness gates', () => {
  assert.match(read('server.js'), /await assertDatabaseSchemaReady\(\)/);
  assert.match(read('worker.js'), /await assertDatabaseSchemaReady\(\)/);
  assert.match(read('server.js'), /app\.get\("\/api\/health\/ready", readinessHandler\)/);
});
