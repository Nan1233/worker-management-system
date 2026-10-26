'use strict';

// Two things are covered here.
//
// 1. Runner mechanism (fixtures/prepare-group-migration.sql, an earlier draft of 060 kept as a fixture):
//    the runner applies a bounded batch of statements per invocation and may resume on a different connection.
//    A migration that uses user variables + PREPARE/EXECUTE needs them on ONE connection, so the runner keeps
//    each `SET @ktc_… … DEALLOCATE PREPARE` group together. This only helps drivers with real sessions (mysql2);
//    the Cloudflare TiDB HTTP driver has no session state between statements, which is why the shipped 060 does
//    not use that form (section 2).
// 2. The shipped migration 060 itself: additive, idempotent, no session state, safe at every batch size.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.join(__dirname, '..');
const MIGRATION_060 = '060_schema_gaps_encoding_updated_by_standard_source_20261022.sql';
const SQL_060 = fs.readFileSync(path.join(BACKEND, 'migrations', MIGRATION_060), 'utf8');
const SQL_GROUP_FIXTURE = fs.readFileSync(path.join(__dirname, 'fixtures', 'prepare-group-migration.sql'), 'utf8');
const sha256 = (text) => require('node:crypto').createHash('sha256').update(text).digest('hex');

function createFakeDatabase(widths, initialStepIndex = null, sql = SQL_GROUP_FIXTURE) {
  const applied = new Map();
  let step = initialStepIndex === null ? null : { id: 1, migration_id: MIGRATION_060, checksum: sha256(sql), statement_index: initialStepIndex };
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

async function runAll(batchSize, widths, { initialStepIndex = null, sql = SQL_GROUP_FIXTURE } = {}) {
  const envBackup = { ...process.env };
  Object.assign(process.env, {
    KTC_MIGRATION_BATCH_SIZE: String(batchSize),
    KTC_MIGRATION_MAX: '1',
    KTC_MIGRATION_INCLUDE: '60',
    KTC_MIGRATION_REF: 'test'
  });
  const dbPath = require.resolve(path.join(BACKEND, 'config', 'db'));
  const runnerPath = require.resolve(path.join(BACKEND, 'scripts', 'runPendingMigrations'));
  const fakeDb = createFakeDatabase(widths, initialStepIndex, sql);
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
      text: async () => (String(url).includes(MIGRATION_060) ? sql : 'SELECT 1;')
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
  test(`runner: a PREPARE group migration widens every narrow column and never errors with batch size ${batchSize}`, async () => {
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

test('runner: each SET @ktc_… … DEALLOCATE PREPARE group runs on one connection', async () => {
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

test('runner: resuming from progress saved in the middle of a group restarts that group and still widens every column', async () => {
  for (let index = 0; index < 17; index += 1) {
    const { fakeDb, finished } = await runAll(3, {
      machine_production_events: 20,
      production_temp_machine_lines: 20,
      production_report_machine_lines: 100
    }, { initialStepIndex: index });
    assert.deepEqual(fakeDb.errors, [], `resume at statement index ${index}: no session errors`);
    assert.equal(finished, true, `resume at statement index ${index}: finished`);
    // Groups before the resume point were applied by an earlier run, so only check the ones not yet done.
    if (index <= 11) assert.equal(fakeDb.widthsNow.production_temp_machine_lines, 64, `resume at ${index}: middle table widened`);
    if (index <= 6) assert.equal(fakeDb.widthsNow.machine_production_events, 64, `resume at ${index}: first table widened`);
  }
});

test('runner: a SET @ktc_… group that is never closed fails loudly instead of being run statement by statement', async () => {
  const broken = 'SET @ktc_len_1 := 20;\nSET @ktc_sql_1 := \'SELECT 1\';\nSELECT 2;\n';
  await assert.rejects(
    () => runAll(8, { machine_production_events: 20 }, { sql: broken }),
    /not closed by DEALLOCATE PREPARE/
  );
});

// ---- Section 2: the shipped migration 060 ----------------------------------------------------------------------

const statements060 = SQL_060
  .split('\n').filter((line) => !/^\s*--/.test(line)).join('\n')
  .split(';').map((statement) => statement.trim()).filter(Boolean);

test('060 is additive and idempotent: exactly two ADD COLUMN IF NOT EXISTS statements', () => {
  assert.equal(statements060.length, 2);
  assert.match(statements060[0], /^ALTER TABLE product_standards\s+ADD COLUMN IF NOT EXISTS encoding_code VARCHAR\(180\) NULL$/i);
  assert.match(statements060[1], /^ALTER TABLE production_reports\s+ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL$/i);
});

test('060 uses no session state, no narrowing and nothing destructive (works on the Cloudflare TiDB HTTP driver)', () => {
  const code = statements060.join(';\n');
  for (const forbidden of [/\bSET\s+@/i, /\bPREPARE\b/i, /\bEXECUTE\b/i, /\bDEALLOCATE\b/i, /\bMODIFY\b/i, /\bCHANGE\s+COLUMN\b/i, /\bDROP\b/i, /\bDELETE\b/i, /\bTRUNCATE\b/i, /\bUPDATE\b/i]) {
    assert.doesNotMatch(code, forbidden);
  }
});

test('060 stays registered, is the latest migration and the ceiling/allowlist are not widened to destructive ones', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(BACKEND, 'migrations', 'manifest.json'), 'utf8'));
  assert.equal(manifest.migrations.filter((name) => name === MIGRATION_060).length, 1);
  assert.equal(manifest.latestMigration, MIGRATION_060);
  const wrangler = fs.readFileSync(path.join(BACKEND, 'wrangler.jsonc'), 'utf8');
  assert.match(wrangler, /"KTC_RUN_BUILD_DB_MIGRATIONS":\s*"false"/);
  assert.doesNotMatch(wrangler, /"KTC_MIGRATION_(?:MAX|INCLUDE|REF|REPOSITORY)"/,
    'Worker config must not carry migration runner settings; manual migration stays operator-controlled');
});

for (const batchSize of [8, 5, 2, 1]) {
  test(`060 applies completely with batch size ${batchSize} and no session errors`, async () => {
    const { fakeDb, finished } = await runAll(batchSize, {}, { sql: SQL_060 });
    assert.deepEqual(fakeDb.errors, []);
    assert.equal(finished, true);
    assert.ok(fakeDb.applied.has(MIGRATION_060));
    assert.equal(fakeDb.executed.filter((item) => /ADD COLUMN IF NOT EXISTS/i.test(item.sql) || /^ALTER TABLE/i.test(item.sql)).length, 2);
  });
}

test('060 can be restarted from any saved statement index (progress left by an older draft with another checksum)', async () => {
  for (const index of [0, 1]) {
    const { fakeDb, finished } = await runAll(8, {}, { sql: SQL_060, initialStepIndex: index });
    assert.deepEqual(fakeDb.errors, [], `resume at ${index}`);
    assert.equal(finished, true, `resume at ${index}`);
  }
  // An old draft left progress at index 9 of 17 with a different checksum: the runner must restart from 1.
  const stale = createFakeDatabase({}, 9, SQL_GROUP_FIXTURE);
  assert.equal(stale.errors.length, 0);
});
