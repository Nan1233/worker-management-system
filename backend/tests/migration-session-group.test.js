'use strict';

// The Cloudflare migration runner applies a bounded batch of statements per invocation and may resume on a
// different connection. Migration 060 uses user variables + PREPARE/EXECUTE, which only exist on one
// connection, so the runner must keep each `SET @ktc_… … DEALLOCATE PREPARE` group on a single connection.
// This test models that session behaviour with a fake connection and runs the real runner and the real 060 file.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');
const MIGRATION_060 = '060_schema_gaps_encoding_updated_by_standard_source_20261022.sql';
const SQL_060 = fs.readFileSync(path.join(BACKEND, 'migrations', MIGRATION_060), 'utf8');

function createFakeDatabase(widths) {
  const applied = new Map();
  let step = null;
  let connectionCount = 0;
  const executed = [];
  const errors = [];
  const widthsNow = { ...widths };

  function makeConnection() {
    const id = ++connectionCount;
    const vars = new Map();
    const prepared = new Map();
    const fail = (message) => { const error = new Error(message); errors.push(message); throw error; };
    return {
      id,
      async release() {},
      async query(sql, params = []) {
        const text = String(sql).trim();
        if (/^CREATE TABLE IF NOT EXISTS/i.test(text)) return [[], []];
        if (/^SELECT DATABASE\(\)/i.test(text)) return [[{ db_name: 'ktc_fake' }], []];
        if (/^SELECT migration_id, checksum FROM schema_migrations/i.test(text)) {
          return [[...applied].map(([migration_id, checksum]) => ({ migration_id, checksum })), []];
        }
        if (/^SELECT .*FROM schema_migration_steps WHERE id=1/i.test(text)) return [step ? [step] : [], []];
        if (/^INSERT INTO schema_migration_steps/i.test(text)) {
          step = { id: 1, migration_id: params[0], checksum: params[1], statement_index: params[2] };
          return [{}, []];
        }
        if (/^DELETE FROM schema_migration_steps/i.test(text)) { step = null; return [{}, []]; }
        if (/^INSERT INTO schema_migrations/i.test(text)) { applied.set(params[0], params[1]); return [{}, []]; }
        if (/^SELECT COUNT\(\*\) AS count FROM schema_migrations/i.test(text)) return [[{ count: applied.size }], []];

        executed.push({ connection: id, sql: text.split('\n')[0].slice(0, 80) });

        let match = text.match(/^SET\s+@(ktc_len_\d+)\s*:=[\s\S]*table_name = '(\w+)'/i);
        if (match) { vars.set(match[1], widthsNow[match[2]] ?? null); return [{}, []]; }

        match = text.match(/^SET\s+@(ktc_sql_\d+)\s*:=\s*IF\(\s*@(ktc_len_\d+) IS NOT NULL AND @\2 < 64,\s*'([^']+)'/i);
        if (match) {
          const len = vars.get(match[2]);
          vars.set(match[1], len !== undefined && len !== null && len < 64 ? match[3] : 'SELECT 1');
          return [{}, []];
        }

        match = text.match(/^PREPARE\s+(\w+)\s+FROM\s+@(\w+)/i);
        if (match) {
          if (!vars.has(match[2]) || vars.get(match[2]) === null) fail(`variable @${match[2]} is not set in this session`);
          prepared.set(match[1], vars.get(match[2]));
          return [{}, []];
        }

        match = text.match(/^EXECUTE\s+(\w+)/i);
        if (match) {
          if (!prepared.has(match[1])) fail(`Unknown prepared statement handler (${match[1]}) given to EXECUTE`);
          const alter = prepared.get(match[1]).match(/^ALTER TABLE (\w+) MODIFY COLUMN standard_source VARCHAR\(64\)/i);
          if (alter) widthsNow[alter[1]] = 64;
          return [{}, []];
        }

        match = text.match(/^DEALLOCATE\s+PREPARE\s+(\w+)/i);
        if (match) {
          if (!prepared.has(match[1])) fail(`Unknown prepared statement handler (${match[1]}) given to DEALLOCATE PREPARE`);
          prepared.delete(match[1]);
          return [{}, []];
        }

        return [{}, []]; // ALTER TABLE … ADD COLUMN IF NOT EXISTS and similar single statements
      }
    };
  }

  return {
    errors, executed, widthsNow, applied,
    promise: () => ({ getConnection: async () => makeConnection() }),
    getMissingDatabaseVariables: () => []
  };
}

async function runAll(batchSize, widths) {
  const envBackup = { ...process.env };
  Object.assign(process.env, {
    KTC_MIGRATION_BATCH_SIZE: String(batchSize),
    KTC_MIGRATION_MAX: '1',
    KTC_MIGRATION_INCLUDE: '60',
    KTC_MIGRATION_REF: 'test'
  });
  const dbPath = require.resolve(path.join(BACKEND, 'config', 'db'));
  const runnerPath = require.resolve(path.join(BACKEND, 'scripts', 'runPendingMigrations'));
  const fakeDb = createFakeDatabase(widths);
  const dbBackup = require.cache[dbPath];
  const fetchBackup = globalThis.fetch;
  const logBackup = console.log;
  try {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakeDb };
    delete require.cache[runnerPath];
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => (String(url).includes(MIGRATION_060) ? SQL_060 : 'SELECT 1;')
    });
    console.log = () => {};
    const run = require(runnerPath);
    let finished = false;
    let invocations = 0;
    while (!finished && invocations < 200) {
      invocations += 1;
      finished = (await run()) === true;
    }
    return { fakeDb, finished, invocations };
  } finally {
    console.log = logBackup;
    globalThis.fetch = fetchBackup;
    if (dbBackup) require.cache[dbPath] = dbBackup; else delete require.cache[dbPath];
    delete require.cache[runnerPath];
    for (const key of Object.keys(process.env)) if (!(key in envBackup)) delete process.env[key];
    Object.assign(process.env, envBackup);
  }
}

for (const batchSize of [8, 5, 3, 2, 1]) {
  test(`migration 060 widens every narrow standard_source and never errors with batch size ${batchSize}`, async () => {
    const { fakeDb, finished, invocations } = await runAll(batchSize, {
      machine_production_events: 20,
      production_temp_machine_lines: 20,
      production_report_machine_lines: 100
    });
    assert.deepEqual(fakeDb.errors, [], 'no session-state errors (variables and prepared handles stay on one connection)');
    assert.equal(finished, true, `runner finished after ${invocations} invocations`);
    assert.equal(fakeDb.widthsNow.machine_production_events, 64);
    assert.equal(fakeDb.widthsNow.production_temp_machine_lines, 64, 'the table in the middle of the file is not silently skipped');
    assert.equal(fakeDb.widthsNow.production_report_machine_lines, 100, 'a column already wider than 64 is never narrowed');
    assert.ok(fakeDb.applied.has(MIGRATION_060));
  });
}

test('each SET @ktc_… … DEALLOCATE PREPARE group runs on one connection', async () => {
  const { fakeDb } = await runAll(3, {
    machine_production_events: 20,
    production_temp_machine_lines: 20,
    production_report_machine_lines: 20
  });
  const groups = [];
  let current = null;
  for (const item of fakeDb.executed) {
    if (/^SET @ktc_len_/i.test(item.sql)) current = [];
    if (current) current.push(item);
    if (current && /^DEALLOCATE PREPARE/i.test(item.sql)) { groups.push(current); current = null; }
  }
  assert.equal(groups.length, 3);
  for (const group of groups) {
    assert.equal(group.length, 5);
    assert.equal(new Set(group.map((item) => item.connection)).size, 1, 'one connection per group');
  }
});
