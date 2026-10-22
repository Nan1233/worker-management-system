const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

// In-memory defect_types for the GC process (id 7). The stub records every statement.
function loadSeed(rows) {
  const log = [];
  const fakeDb = {
    query(sql, params, cb) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      log.push(text);
      if (/FROM processes/i.test(text)) return cb(null, [{ id: 7 }]);
      if (/^SELECT defect_code FROM defect_types/i.test(text)) return cb(null, rows.filter((r) => r.process_id === params[0]).map((r) => ({ defect_code: r.defect_code })));
      if (/^INSERT INTO defect_types/i.test(text)) { rows.push({ process_id: params[0], defect_code: params[1], defect_name: params[2], sort_order: params[3], status: 'active' }); return cb(null, { affectedRows: 1 }); }
      return cb(new Error(`unexpected SQL: ${text}`));
    },
  };
  const original = Module._load;
  Module._load = function (request, parent, isMain) { return request === '../config/db' ? fakeDb : original.call(this, request, parent, isMain); };
  const file = require.resolve('../scripts/ensureGcDefectMasterData');
  delete require.cache[file];
  try { return { seed: require(file), log }; } finally { Module._load = original; }
}
const withEnv = async (vars, fn) => {
  const prev = {}; for (const k of Object.keys(vars)) { prev[k] = process.env[k]; if (vars[k] === null) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return await fn(); } finally { for (const k of Object.keys(vars)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } }
};
const adminRows = () => ([
  { process_id: 7, defect_code: 'CAT01', defect_name: 'Tên do admin sửa', sort_order: 99, status: 'inactive' },
  { process_id: 7, defect_code: 'XYZ_CUSTOM', defect_name: 'Lỗi admin tự thêm', sort_order: 3, status: 'active' },
  { process_id: 8, defect_code: 'CAT02', defect_name: 'Quy trình khác', sort_order: 1, status: 'active' },
]);

test('dry run (default) reads only and reports the missing canonical codes', async () => {
  await withEnv({ KTC_CLOUDFLARE_WORKER: null }, async () => {
    const rows = adminRows(); const before = JSON.stringify(rows);
    const { seed, log } = loadSeed(rows);
    const result = await seed();
    assert.equal(result.dryRun, true);
    assert.ok(result.missing.length === 17 && !result.missing.includes('CAT01'));
    assert.equal(JSON.stringify(rows), before);
    assert.ok(log.every((sql) => /^SELECT/i.test(sql)), log.join(' | '));
  });
});

test('apply inserts only missing codes and never overwrites, re-activates or deactivates admin data', async () => {
  await withEnv({ KTC_CLOUDFLARE_WORKER: null }, async () => {
    const rows = adminRows();
    const { seed, log } = loadSeed(rows);
    const result = await seed({ apply: true });
    assert.equal(result.inserted.length, 17);
    const cat01 = rows.find((r) => r.process_id === 7 && r.defect_code === 'CAT01');
    assert.deepEqual([cat01.defect_name, cat01.sort_order, cat01.status], ['Tên do admin sửa', 99, 'inactive']);
    assert.equal(rows.find((r) => r.defect_code === 'XYZ_CUSTOM').status, 'active', 'non-canonical admin code is not deactivated');
    assert.equal(rows.find((r) => r.process_id === 8).defect_name, 'Quy trình khác');
    assert.ok(!log.some((sql) => /^(UPDATE|DELETE|TRUNCATE|DROP|ALTER)/i.test(sql)), log.join(' | '));
  });
});

test('running apply again changes nothing', async () => {
  await withEnv({ KTC_CLOUDFLARE_WORKER: null }, async () => {
    const rows = adminRows();
    const { seed } = loadSeed(rows);
    await seed({ apply: true });
    const snapshot = JSON.stringify(rows);
    const second = await seed({ apply: true });
    assert.deepEqual(second.inserted, []);
    assert.equal(JSON.stringify(rows), snapshot);
  });
});

test('inside the Cloudflare Worker the seed does not touch the database at all', async () => {
  await withEnv({ KTC_CLOUDFLARE_WORKER: 'true' }, async () => {
    const rows = adminRows(); const before = JSON.stringify(rows);
    const { seed, log } = loadSeed(rows);
    assert.deepEqual(await seed({ apply: true }), { skipped: true, reason: 'cloudflare-worker' });
    assert.equal(log.length, 0);
    assert.equal(JSON.stringify(rows), before);
  });
});

test('npm start does not seed GC defects or migrate; the seed source has no destructive SQL', () => {
  const start = JSON.parse(read('package.json')).scripts.start;
  assert.doesNotMatch(start, /ensureGcDefectMasterData|runPendingMigrations|db:migrate|runBuildMigrations/);
  assert.doesNotMatch(read('scripts/ensureGcDefectMasterData.js'), /\b(DELETE|TRUNCATE|DROP|ALTER)\b|ON DUPLICATE KEY|UPDATE defect_types/i);
});

test('GC 2801-LT seed is read-only', () => {
  assert.doesNotMatch(read('scripts/ensureGcLong2801Lt.js'), /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|REPLACE)\b\s/i);
});
