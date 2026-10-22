'use strict';

// KTC_MIGRATION_DRY_RUN=true must list what a real run would apply and stop, using SELECT statements only.
// The real runner and the real migration files are used; only the database connection is faked.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');
const M001 = '001_core_master_schema.sql';
const M060 = '060_schema_gaps_encoding_updated_by_standard_source_20261022.sql';
const sha = (name) => crypto.createHash('sha256').update(fs.readFileSync(path.join(BACKEND, 'migrations', name), 'utf8')).digest('hex');

function createFakeDatabase({ applied = {}, step = null, stateReadable = true } = {}) {
  const queries = [];
  const connection = {
    async release() {},
    async query(sql) {
      const text = String(sql).trim();
      queries.push(text);
      if (/^SELECT DATABASE\(\)/i.test(text)) return [[{ db_name: 'ktc_restore_check' }], []];
      if (/^SELECT migration_id, checksum FROM schema_migrations/i.test(text)) {
        if (!stateReadable) throw new Error("Table 'schema_migrations' doesn't exist");
        return [Object.entries(applied).map(([migration_id, checksum]) => ({ migration_id, checksum })), []];
      }
      if (/^SELECT .*FROM schema_migration_steps/i.test(text)) return [step ? [step] : [], []];
      // Anything else (CREATE/INSERT/ALTER/SET/PREPARE/...) is a mutation the real path would make.
      return [{}, []];
    }
  };
  return { queries, promise: () => ({ getConnection: async () => connection }), getMissingDatabaseVariables: () => [] };
}

async function runOnce(fakeDb, env = {}) {
  const envBackup = { ...process.env };
  Object.assign(process.env, { KTC_MIGRATION_MAX: '1', KTC_MIGRATION_INCLUDE: '60', KTC_MIGRATION_REF: 'test' }, env);
  const dbPath = require.resolve(path.join(BACKEND, 'config', 'db'));
  const runnerPath = require.resolve(path.join(BACKEND, 'scripts', 'runPendingMigrations'));
  const dbBackup = require.cache[dbPath];
  const fetchBackup = globalThis.fetch;
  const logBackup = console.log;
  const lines = [];
  try {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
    delete require.cache[runnerPath];
    globalThis.fetch = async (url) => {
      const name = decodeURIComponent(String(url).split('/').pop());
      const file = path.join(BACKEND, 'migrations', name);
      return { ok: true, status: 200, statusText: 'OK', text: async () => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : 'SELECT 1;') };
    };
    console.log = (...args) => lines.push(args.join(' '));
    const run = require(runnerPath);
    let error = null;
    let result;
    try { result = await run(); } catch (caught) { error = caught; }
    return { lines, error, result };
  } finally {
    console.log = logBackup;
    globalThis.fetch = fetchBackup;
    if (dbBackup) require.cache[dbPath] = dbBackup; else delete require.cache[dbPath];
    delete require.cache[runnerPath];
    for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key];
    Object.assign(process.env, envBackup);
  }
}

const pendingLines = (lines) => lines.filter((line) => /DRY-RUN\] pending\[\d+\]=/.test(line));
const onlySelects = (queries) => queries.every((query) => /^SELECT\b/i.test(query));

test('dry-run with 001 pending lists 001 then 060 in order and executes nothing', async () => {
  const fake = createFakeDatabase();
  const { lines, error, result } = await runOnce(fake, { KTC_MIGRATION_DRY_RUN: 'true' });
  assert.equal(error, null);
  assert.equal(result, false);
  const pending = pendingLines(lines);
  assert.equal(pending.length, 2);
  assert.match(pending[0], new RegExp(`pending\\[1\\]=${M001} checksum=${sha(M001)}`));
  assert.match(pending[1], new RegExp(`pending\\[2\\]=${M060} checksum=${sha(M060)}`));
  assert.ok(lines.some((line) => /target: database=ktc_restore_check .*ref=test ceiling=1/.test(line)));
  assert.ok(lines.some((line) => /nothing was executed/.test(line)));
  assert.ok(onlySelects(fake.queries), `only SELECT statements expected, got: ${fake.queries.filter((q) => !/^SELECT\b/i.test(q)).join(' | ')}`);
});

test('dry-run with 001 already applied (matching checksum) lists only 060', async () => {
  const fake = createFakeDatabase({ applied: { [M001]: sha(M001) } });
  const { lines, error } = await runOnce(fake, { KTC_MIGRATION_DRY_RUN: 'true' });
  assert.equal(error, null);
  const pending = pendingLines(lines);
  assert.equal(pending.length, 1);
  assert.match(pending[0], new RegExp(`pending\\[1\\]=${M060}`));
  assert.ok(lines.some((line) => /applied=1 pending=1/.test(line)));
  assert.ok(onlySelects(fake.queries));
});

test('dry-run stops when a half-applied migration exists', async () => {
  const fake = createFakeDatabase({ applied: { [M001]: sha(M001) }, step: { id: 1, migration_id: M060, checksum: 'x', statement_index: 3 } });
  const { error, lines } = await runOnce(fake, { KTC_MIGRATION_DRY_RUN: 'true' });
  assert.match(String(error && error.message), /half-applied/);
  assert.equal(pendingLines(lines).length, 0);
  assert.ok(onlySelects(fake.queries));
});

test('dry-run stops when an applied migration no longer matches its recorded checksum', async () => {
  const fake = createFakeDatabase({ applied: { [M001]: 'f'.repeat(64) } });
  const { error, lines } = await runOnce(fake, { KTC_MIGRATION_DRY_RUN: 'true' });
  assert.match(String(error && error.message), new RegExp(`checksum differs.*${M001}`));
  assert.equal(pendingLines(lines).length, 0);
  assert.ok(onlySelects(fake.queries));
});

test('dry-run stops when the migration state cannot be read and does not create the tracking tables', async () => {
  const fake = createFakeDatabase({ stateReadable: false });
  const { error } = await runOnce(fake, { KTC_MIGRATION_DRY_RUN: 'true' });
  assert.match(String(error && error.message), /cannot read migration state/);
  assert.ok(onlySelects(fake.queries), 'no CREATE TABLE in dry-run');
});

test('without KTC_MIGRATION_DRY_RUN the runner still creates its tracking tables and applies migrations', async () => {
  const fake = createFakeDatabase({ applied: { [M001]: sha(M001) } });
  const { lines } = await runOnce(fake);
  assert.ok(fake.queries.some((query) => /^CREATE TABLE IF NOT EXISTS schema_migrations/i.test(query)));
  assert.ok(lines.some((line) => new RegExp(`applying ${M060}`).test(line)));
  assert.equal(lines.some((line) => /DRY-RUN/.test(line)), false);
});

test('KTC_MIGRATION_DRY_RUN other than "true" does not enable dry-run', async () => {
  const fake = createFakeDatabase({ applied: { [M001]: sha(M001) } });
  const { lines } = await runOnce(fake, { KTC_MIGRATION_DRY_RUN: 'false' });
  assert.equal(lines.some((line) => /DRY-RUN/.test(line)), false);
  assert.ok(fake.queries.some((query) => /^CREATE TABLE IF NOT EXISTS/i.test(query)));
});
