const test = require('node:test');
const assert = require('node:assert/strict');

const Module = require('node:module');
const path = require('node:path');

// auditService requires the real DB pool at import time, which keeps `node --test` alive. Load it with a stub.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../config/db') return { promise: () => { throw new Error('db must not be used in this test'); } };
  return originalLoad.call(this, request, parent, isMain);
};
const servicePath = path.join(__dirname, '..', 'services', 'auditService.js');
delete require.cache[require.resolve(servicePath)];
const { createReportVersion } = require(servicePath);
Module._load = originalLoad;

// Fake report_versions table with UNIQUE KEY uq_report_version (report_type, report_id, version_no).
// `insertIdMode` decides what the MySQL-style single-statement INSERT ... SELECT reports back.
function fakeExecutor({ insertIdMode = 'ok', beforeExplicitInsert = null, failInsertWith = null } = {}) {
  const rows = [];
  const log = [];
  let globalId = 1000;
  const insertRow = (type, reportId, versionNo, extra = {}) => {
    if (rows.some((r) => r.type === type && r.reportId === reportId && r.versionNo === versionNo)) {
      const error = new Error(`Duplicate entry '${type}-${reportId}-${versionNo}' for key 'uq_report_version'`);
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    globalId += 1;
    rows.push({ id: globalId, type, reportId, versionNo, ...extra });
    return globalId;
  };
  const maxFor = (type, reportId) => Math.max(0, ...rows.filter((r) => r.type === type && r.reportId === reportId).map((r) => r.versionNo));
  const executor = {
    rows,
    log,
    insertRow,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      log.push(text);
      if (/^SELECT COALESCE\(MAX\(version_no\), 0\) \+ 1 AS next_version/i.test(text)) {
        const next = insertIdMode === 'unreadable-next' ? null : maxFor(params[0], params[1]) + 1;
        const result = [[{ next_version: next }], []];
        if (typeof beforeExplicitInsert === 'function') executor.pendingHook = beforeExplicitInsert;
        return result;
      }
      if (/^INSERT INTO report_versions .* VALUES/i.test(text)) {
        if (executor.pendingHook) { const hook = executor.pendingHook; executor.pendingHook = null; hook(executor, params); }
        if (failInsertWith) throw failInsertWith;
        const [type, reportId, versionNo] = params;
        const id = insertRow(type, reportId, versionNo);
        return [{ insertId: id, affectedRows: 1 }, []];
      }
      if (/^INSERT INTO report_versions .* SELECT/i.test(text)) {
        const type = params[0];
        const reportId = params[1];
        const versionNo = maxFor(type, reportId) + 1;
        const id = insertRow(type, reportId, versionNo);
        // MySQL: LAST_INSERT_ID(expr) makes insertId the version number. TiDB HTTP: metadata can be missing.
        const insertId = insertIdMode === 'ok' ? versionNo : (insertIdMode === 'wrong-global-id' ? id : 0);
        return [{ insertId, affectedRows: 1 }, []];
      }
      throw new Error(`unexpected SQL in fake executor: ${text}`);
    },
  };
  return executor;
}

const withRuntime = async (cloudflare, fn) => {
  const previous = process.env.KTC_CLOUDFLARE_WORKER;
  if (cloudflare) process.env.KTC_CLOUDFLARE_WORKER = 'true'; else delete process.env.KTC_CLOUDFLARE_WORKER;
  try { return await fn(); } finally {
    if (previous === undefined) delete process.env.KTC_CLOUDFLARE_WORKER; else process.env.KTC_CLOUDFLARE_WORKER = previous;
  }
};

const create = (executor, reportId = 7) => createReportVersion({ reportType: 'approved', reportId, snapshot: { a: 1 }, reason: 'r', userId: 3 }, executor);

test('MySQL path: insertId present is the per-report version_no, not the global id', async () => {
  await withRuntime(false, async () => {
    const ex = fakeExecutor({ insertIdMode: 'ok' });
    assert.equal(await create(ex), 1);
    assert.equal(await create(ex), 2);
    assert.equal(ex.rows[1].id > 1000 && ex.rows[1].versionNo, 2);
  });
});

test('MySQL path: missing insertId fails loudly and never guesses from the latest row', async () => {
  await withRuntime(false, async () => {
    const ex = fakeExecutor({ insertIdMode: 'missing' });
    await assert.rejects(create(ex), /version_no/);
    assert.equal(ex.log.length, 1, 'no read-back query may be issued');
    assert.ok(!ex.log.some((sql) => /LAST_INSERT_ID\(\) AS|ORDER BY version_no DESC/i.test(sql)));
  });
});

test('Cloudflare path: version is allocated explicitly and returned without insertId metadata', async () => {
  await withRuntime(true, async () => {
    const ex = fakeExecutor({ insertIdMode: 'missing' });
    assert.equal(await create(ex), 1);
    assert.equal(await create(ex), 2);
    assert.equal(await create(ex, 8), 1, 'versions are scoped per report');
    assert.deepEqual(ex.rows.filter((r) => r.reportId === 7).map((r) => r.versionNo), [1, 2]);
  });
});

test('Cloudflare path: a concurrent writer taking the same number causes a retry, not a wrong or duplicate version', async () => {
  await withRuntime(true, async () => {
    const ex = fakeExecutor({
      beforeExplicitInsert: (executor) => { if (!executor.stolen) { executor.stolen = true; executor.insertRow('approved', 7, 1, { by: 'other-writer' }); } },
    });
    const version = await create(ex);
    assert.equal(version, 2, 'must not claim the other writer\'s version 1');
    assert.deepEqual(ex.rows.map((r) => [r.versionNo, r.by || 'me']), [[1, 'other-writer'], [2, 'me']]);
  });
});

test('Cloudflare path: a failing INSERT propagates and leaves no row', async () => {
  await withRuntime(true, async () => {
    const boom = new Error('TiDB write conflict');
    const ex = fakeExecutor({ failInsertWith: boom });
    await assert.rejects(create(ex), /write conflict/);
    assert.equal(ex.rows.length, 0);
    assert.equal(ex.log.filter((sql) => /^INSERT/i.test(sql)).length, 1, 'non-duplicate errors are not retried');
  });
});

test('Cloudflare path: an unreadable next version number stops before any INSERT', async () => {
  await withRuntime(true, async () => {
    const ex = fakeExecutor({ insertIdMode: 'unreadable-next' });
    await assert.rejects(create(ex), /version_no/);
    assert.ok(!ex.log.some((sql) => /^INSERT/i.test(sql)));
  });
});

test('Cloudflare path: gives up after five consecutive duplicate-key collisions', async () => {
  await withRuntime(true, async () => {
    const ex = fakeExecutor({ beforeExplicitInsert: (executor) => { executor.insertRow('approved', 7, Math.max(0, ...executor.rows.map((r) => r.versionNo)) + 1, { by: 'racer' }); } });
    await assert.rejects(create(ex), /duplicate/i);
    assert.equal(ex.log.filter((sql) => /^SELECT COALESCE/i.test(sql)).length, 5);
  });
});

test('invalid report id is rejected before touching the database', async () => {
  const ex = fakeExecutor();
  await assert.rejects(createReportVersion({ reportType: 'approved', reportId: 0, snapshot: {} }, ex), /reportId/);
  assert.equal(ex.log.length, 0);
});
