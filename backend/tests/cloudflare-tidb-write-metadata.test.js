'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Run the actual Cloudflare DB adapter with a fake TiDB Serverless driver.
// No network, production credentials, schema changes or database writes.
process.env.KTC_CLOUDFLARE_WORKER = 'true';
process.env.TIDB_DATABASE_URL = 'mysql://unit:unit@localhost:4000/ktc_unit';
let nextResult;
let lastCall;
let transactionCommitCount = 0;
const execute = async (sql, params, options) => {
  lastCall = { sql, params, options };
  return nextResult;
};
globalThis.__KTC_TIDB_CONNECT = () => ({
  execute,
  begin: async () => ({
    execute,
    commit: async () => { transactionCommitCount += 1; },
    rollback: async () => {},
  }),
});

const db = require('../config/db');
const shared = require('../models/productionTempModelShared');

test('SELECT keeps row arrays even if TiDB supplies rowsAffected metadata', async () => {
  nextResult = { rows: [{ id: 1740001, status: 'pending' }], rowsAffected: 1, fields: [] };
  const [rows] = await db.promise().query('SELECT id, status FROM production_reports_temp WHERE id=?', [1740001]);
  assert.deepEqual(rows, [{ id: 1740001, status: 'pending' }]);
  assert.deepEqual(lastCall.params, [1740001]);
  assert.equal(lastCall.options.fullResult, true);

  nextResult = { rows: [], rowsAffected: 0 };
  const [empty] = await db.promise().query('SELECT id FROM production_reports_temp WHERE id=?', [-1]);
  assert.deepEqual(empty, []);
});

test('UPDATE retains affectedRows=1 even when TiDB returns rows: []', async () => {
  nextResult = { rows: [], rowsAffected: 1, lastInsertId: 0 };
  const [result] = await db.promise().execute(
    "UPDATE production_reports_temp SET status='approved' WHERE id=? AND status='pending'",
    [1740001],
  );
  assert.equal(result.affectedRows, 1);
  assert.equal(result.changedRows, 1);
  assert.equal(result.insertId, 0);
});

test('UPDATE with zero affected rows remains a real conflict', async () => {
  nextResult = { rows: [], rowsAffected: 0 };
  const [result] = await db.promise().query(
    "UPDATE production_reports_temp SET status='approved' WHERE id=? AND status='pending'",
    [1740001],
  );
  assert.equal(result.affectedRows, 0);
});

test('INSERT retains lastInsertId and affectedRows even when rows is empty', async () => {
  nextResult = { rows: [], rowsAffected: 1, lastInsertId: 987654 };
  const [result] = await db.promise().query('INSERT INTO production_reports (worker_id) VALUES (?)', [1]);
  assert.equal(result.affectedRows, 1);
  assert.equal(result.insertId, 987654);
});

test('DELETE and REPLACE retain write metadata; alternate driver field names work', async () => {
  nextResult = { rows: [], affectedRows: 1, insertId: 0 };
  const [deleted] = await db.promise().query('DELETE FROM report_action_logs WHERE id=?', [3]);
  assert.equal(deleted.affectedRows, 1);

  nextResult = { rows: [], rowsAffected: 2, lastInsertId: 15 };
  const [replaced] = await db.promise().query('REPLACE INTO sample (id) VALUES (?)', [15]);
  assert.equal(replaced.affectedRows, 2);
  assert.equal(replaced.insertId, 15);
});

test('approval shared query preserves affectedRows through transaction callback API', async () => {
  const connection = await shared.getConnection();
  try {
    await shared.beginTransaction(connection);
    nextResult = { rows: [], rowsAffected: 1 };
    const update = await shared.query(
      connection,
      "UPDATE production_reports_temp SET status='approved', updated_at=NOW() WHERE id=? AND status IN ('pending','need_fix') AND updated_at=?",
      [1740001, '2026-11-09 17:12:35'],
    );
    assert.equal(update.affectedRows, 1, 'approval must not misclassify a successful write as stale');
    await shared.commit(connection);
    assert.equal(transactionCommitCount, 1);
  } finally {
    await connection.release();
  }
});
