'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const projectRoot = path.resolve(root, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const manifestService = require('../services/migrationManifestService');
const { analyzeMigrationState, SCHEMA_STATUS } = require('../services/databaseSchemaService');
const { assertFormulaEffectiveRangeCompatibility } = require('../services/migrationPreflightService');

const manifest = manifestService.getCanonicalMigrationManifest();
const latest = manifest.at(-1);
const exactRows = manifest.map((m) => ({ migration_id: m.filename, checksum: m.checksum, applied_at: '2026-08-13T00:00:00Z' }));
const m25 = read('migrations/025_formula_settings_effective_range_20260813.sql');
const hash = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

// 1-4 canonical authority / verifier

test('manifest auto-derives migration 025 as current schema authority', () => {
  assert.equal(manifest.length, 25);
  assert.equal(latest.version, 25);
  assert.equal(latest.filename, '025_formula_settings_effective_range_20260813.sql');
  assert.equal(latest.checksum, hash(m25));
});

test('source 025 with DB through 024 is MIGRATIONS_PENDING', () => {
  assert.equal(analyzeMigrationState(manifest, exactRows.slice(0, -1)).status, SCHEMA_STATUS.MIGRATIONS_PENDING);
});

test('exact ledger through 025 is READY', () => {
  assert.equal(analyzeMigrationState(manifest, exactRows).status, SCHEMA_STATUS.READY);
});

test('unknown future 026 remains rejected', () => {
  const rows = exactRows.concat({ migration_id: '026_future.sql', checksum: 'a'.repeat(64), applied_at: null });
  assert.equal(analyzeMigrationState(manifest, rows).status, SCHEMA_STATUS.UNEXPECTED_FUTURE_MIGRATION);
});

// 5-9 migration 025 semantics

test('migration 025 adds exact DATE NULL effective-range columns without rewriting formula data', () => {
  assert.match(m25, /ADD COLUMN IF NOT EXISTS effective_from DATE NULL AFTER process_id/i);
  assert.match(m25, /ADD COLUMN IF NOT EXISTS effective_to DATE NULL AFTER effective_from/i);
  assert.doesNotMatch(m25, /UPDATE\s+production_formula_settings|DELETE\s+FROM\s+production_formula_settings/i);
});

test('legacy already-mutated exact columns converge through IF NOT EXISTS plus definition assertions', () => {
  assert.match(m25, /ADD COLUMN IF NOT EXISTS effective_from/i);
  assert.match(m25, /ADD COLUMN IF NOT EXISTS effective_to/i);
  const preflight = read('services/migrationPreflightService.js');
  assert.match(preflight, /data_type[\s\S]*is_nullable[\s\S]*column_default/i);
  assert.match(preflight, /=== 'date'[\s\S]*=== 'YES'[\s\S]*column_default == null/i);
});

test('legacy partial mutation can add whichever effective-range column is missing', () => {
  const adds = m25.match(/ADD COLUMN IF NOT EXISTS effective_(?:from|to)/gi) || [];
  assert.equal(adds.length, 2);
  assert.ok(adds.some((x) => /effective_from/i.test(x)));
  assert.ok(adds.some((x) => /effective_to/i.test(x)));
});

test('wrong existing effective-range definition fails before migration ledger success can be written', () => {
  const preflight = read('services/migrationPreflightService.js');
  assert.match(preflight, /MIGRATION_SCHEMA_INCOMPATIBLE/);
  assert.match(preflight, /025_formula_settings_effective_range_20260813\.sql/);
  const runner = read('scripts/runMigrations.js');
  assert.ok(runner.indexOf('for (const statement of statements)') < runner.indexOf('INSERT INTO schema_migrations'));
});

test('migration 025 rerun is safe for missing or exact-compatible columns but not silently for incompatible definitions', () => {
  const runbook = fs.readFileSync(path.join(projectRoot, 'docs/DEPLOYMENT_RUNBOOK.md'), 'utf8');
  assert.match(runbook, /Migration 025/i);
  assert.match(runbook, /RERUN_SAFE/i);
  assert.match(runbook, /incompatible/i);
  assert.match(runbook, /STOP|REVIEW/i);
});

// 10-12 runtime DDL authority

test('formula settings service performs zero runtime schema DDL', () => {
  const src = read('services/formulaSettingsService.js');
  assert.match(src, /Schema ownership belongs exclusively to canonical migrations\/release/);
  assert.doesNotMatch(src, /CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|ADD COLUMN/i);
});

test('excel export job store also no longer creates schema at runtime because migration 004 owns its table', () => {
  const src = read('services/excelExportJobStore.js');
  assert.match(src, /owned by canonical migration 004/i);
  assert.doesNotMatch(src, /CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|ADD COLUMN/i);
});

test('active production JS paths contain no request/startup schema mutation authority', () => {
  const roots = ['services','controllers','models','routes'];
  let text = read('server.js') + '\n' + read('worker.js');
  for (const dir of roots) {
    for (const file of fs.readdirSync(path.join(root, dir))) {
      if (file.endsWith('.js')) text += '\n' + read(`${dir}/${file}`);
    }
  }
  assert.doesNotMatch(text, /CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE INDEX|ADD COLUMN/i);
});

// 13-15 reset / immutable migrations

test('reset physical formula table includes exact effective-range definition', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  const start = reset.indexOf('CREATE TABLE IF NOT EXISTS production_formula_settings');
  const end = reset.indexOf(';', start);
  const block = reset.slice(start, end);
  assert.match(block, /effective_from DATE NULL/i);
  assert.match(block, /effective_to DATE NULL/i);
});

test('reset canonical ledger includes exact migration 025 checksum', () => {
  const reset = read('database/KTC_RESET_FULL_DATABASE_LATEST_20260810.sql');
  assert.match(reset, /FINAL CANONICAL MIGRATION LEDGER 001-025/);
  assert.ok(reset.includes(`('${latest.filename}', '${latest.checksum}')`));
});

test('locked migrations 019-024 remain byte-identical to their locked hashes', () => {
  const expected = {
    19:'ff3a1591f9288910556e74a52dba53620b4ab368fe45874bc8f7826fc15deb33',
    20:'ba958fc0b8fc069d587ac684285fa6c78283619dc4602c278fb2002b862954b9',
    21:'461e39f69b34a9e87df2f9387d6c3db7faa0ecb7852e31d16aef053dc2f4cdf7',
    22:'8f7d148d32dfb7d0dcbafc4c93afa37424f55e536b39c811aeb991ba0bbdad05',
    23:'2c9831b08a21d009888a6bd55710348669caca32936c550660956d38f4b0a2a3',
    24:'60b508fbb7e4b639486151cdcca4d7e36512ce67e018782aa7f5e566fdd7d3d2',
  };
  for (const [v, checksum] of Object.entries(expected)) assert.equal(manifest.find((x) => x.version === Number(v)).checksum, checksum);
});

// 16-20 F17/startup/release regression

test('backend and worker remain verify-only schema consumers, never migrators', () => {
  for (const file of ['server.js','worker.js']) {
    const src = read(file);
    assert.match(src, /assertDatabaseSchemaReady/);
    assert.doesNotMatch(src, /runMigrations|db:migrate|db:release|runMasterSeed/);
  }
});

test('schema-only release separation remains intact after migration 025', () => {
  assert.doesNotMatch(read('scripts/runMigrations.js'), /runMasterSeed|seedMaster/);
  assert.doesNotMatch(read('services/databaseReleaseService.js'), /seed|server\.js|worker\.js/i);
});

test('operator helper still routes release through release:db not demo-schema', () => {
  const src = fs.readFileSync(path.join(projectRoot, 'APPLY_TO_PROJECT.cmd'), 'utf8');
  assert.match(src, /npm run release:db/);
  assert.doesNotMatch(src, /echo\s+npm --prefix backend run db:migrate/i);
});

test('Render retains one backend release hook and readiness health path', () => {
  const render = read('render.yaml');
  assert.equal((render.match(/preDeployCommand:/g) || []).length, 1);
  assert.match(render, /preDeployCommand:\s*npm run db:release/);
  assert.match(render, /healthCheckPath:\s*\/api\/health\/ready/);
});

test('formula business effective-range validation remains unchanged', () => {
  const src = read('services/formulaSettingsService.js');
  assert.match(src, /result\.effective_from && result\.effective_to && result\.effective_to < result\.effective_from/);
  assert.match(src, /Ngày kết thúc hiệu lực phải bằng hoặc sau ngày bắt đầu/);
});


test('executable legacy fixture: both exact DATE NULL columns are compatible', () => {
  assert.doesNotThrow(() => assertFormulaEffectiveRangeCompatibility([
    { column_name:'effective_from', data_type:'date', is_nullable:'YES', column_default:null },
    { column_name:'effective_to', data_type:'date', is_nullable:'YES', column_default:null },
  ]));
});

test('executable legacy fixture: one exact column plus one missing is compatible for rerun', () => {
  assert.doesNotThrow(() => assertFormulaEffectiveRangeCompatibility([
    { column_name:'effective_from', data_type:'date', is_nullable:'YES', column_default:null },
  ]));
});

test('executable legacy fixture: incompatible existing column fails safe', () => {
  assert.throws(
    () => assertFormulaEffectiveRangeCompatibility([
      { column_name:'effective_from', data_type:'datetime', is_nullable:'YES', column_default:null },
    ]),
    (error) => error?.code === 'MIGRATION_SCHEMA_INCOMPATIBLE' && error?.column === 'effective_from',
  );
});
