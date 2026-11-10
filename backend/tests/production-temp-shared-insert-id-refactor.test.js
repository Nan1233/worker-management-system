'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const sharedPath = path.join(__dirname, '../models/productionTempModelShared.js');

function loadWithFakeDb(queryHandler) {
  delete require.cache[require.resolve(sharedPath)];
  const originalLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === '../config/db' && parent?.filename === sharedPath) return {};
    return originalLoad.call(this, request, parent, ...rest);
  };
  try {
    const shared = require(sharedPath);
    const statements = [];
    const connection = {
      query(sql, params, cb) {
        statements.push(sql);
        const response = queryHandler(sql);
        setImmediate(() => cb(null, response));
      },
    };
    return { shared, connection, statements };
  } finally {
    Module._load = originalLoad;
  }
}

test('insert-id recovery preserves existing query count for all insert categories', async () => {
  const cases = [
    { sql: 'INSERT INTO production_reports (worker_id) VALUES (?)', insertId: 0, expectedLookups: 1 },
    { sql: 'INSERT INTO production_reports (worker_id) VALUES (?)', insertId: 42, expectedLookups: 0 },
    { sql: 'INSERT INTO production_report_duplicate_locks (hash) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO production_temp_machine_lines (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO production_temp_machine_defects (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO production_temp_defects (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO production_temp_deductions (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO report_edit_logs (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO report_action_logs (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO activity_logs (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO report_versions (id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'INSERT INTO production_reports /* KTC_BATCH_ID_LOOKUP */ (worker_id) VALUES (?)', insertId: 0, expectedLookups: 0 },
    { sql: 'UPDATE production_reports SET worker_id=?', insertId: 0, expectedLookups: 0 },
  ];
  for (const item of cases) {
    const { shared, connection, statements } = loadWithFakeDb((sql) =>
      sql.startsWith('SELECT LAST_INSERT_ID()') ? [{ insertId: 77 }] : { insertId: item.insertId, affectedRows: 1 });
    const result = await shared.query(connection, item.sql, [7]);
    assert.equal(statements.length, 1 + item.expectedLookups, item.sql);
    assert.equal(result.insertId, item.expectedLookups ? 77 : item.insertId, item.sql);
  }
});

test('insert-id recovery preserves error propagation from lookup', async () => {
  delete require.cache[require.resolve(sharedPath)];
  const originalLoad = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (request === '../config/db' && parent?.filename === sharedPath) return {};
    return originalLoad.call(this, request, parent, ...rest);
  };
  let shared;
  try { shared = require(sharedPath); } finally { Module._load = originalLoad; }
  const connection = {
    query(sql, params, cb) {
      setImmediate(() => sql.startsWith('SELECT LAST_INSERT_ID()')
        ? cb(Object.assign(new Error('lookup failed'), { code: 'ER_FAKE' }))
        : cb(null, { insertId: 0 }));
    },
  };
  await assert.rejects(shared.query(connection, 'INSERT INTO production_reports (worker_id) VALUES (?)', [7]),
    (error) => error.code === 'ER_FAKE' && error.message === 'lookup failed');
});
