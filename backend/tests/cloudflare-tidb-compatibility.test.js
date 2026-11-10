'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeCloudflareResult,
  normalizeNotificationBackfillQuery,
  normalizeApprovedMachineEventQuery,
} = require('../config/cloudflareTidbCompatibility.cjs');

test('compatibility module imports without DB driver, environment, or network', () => {
  assert.equal(typeof normalizeCloudflareResult, 'function');
  assert.equal(typeof normalizeNotificationBackfillQuery, 'function');
  assert.equal(typeof normalizeApprovedMachineEventQuery, 'function');
});

test('TiDB SELECT preserves row arrays; UPDATE with empty rows preserves write metadata', () => {
  const selected = normalizeCloudflareResult({ rows: [{ id: 1740001 }], rowsAffected: 1 }, 'SELECT id FROM production_reports_temp');
  assert.deepEqual(selected[0], [{ id: 1740001 }]);

  const updated = normalizeCloudflareResult({ rows: [], rowsAffected: 1 }, 'UPDATE production_reports_temp SET status=? WHERE id=?');
  assert.equal(updated[0].affectedRows, 1);
  assert.equal(updated[0].changedRows, 1);
  const noMatch = normalizeCloudflareResult({ rows: [], rowsAffected: 0 }, 'UPDATE production_reports_temp SET status=? WHERE id=?');
  assert.equal(noMatch[0].affectedRows, 0);
  const inserted = normalizeCloudflareResult({ rows: [], rowsAffected: 1, lastInsertId: 77 }, 'INSERT INTO production_reports VALUES (?)');
  assert.equal(inserted[0].insertId, 77);
});

test('notification SQL rewrite preserves quoted question marks and substitutes only safe IDs', () => {
  const sql = "INSERT INTO notifications (user_id, link, note) SELECT ?, '?source=approved', 'literal ?'";
  const { sql: normalized, params } = normalizeNotificationBackfillQuery(sql, [15]);
  assert.match(normalized, /SELECT 15, CONCAT\(CHAR\(63\), 'source=approved'\), 'literal \?'/);
  assert.deepEqual(params, []);
  assert.deepEqual(normalizeNotificationBackfillQuery(sql, [0]), { sql, params: [0] });
  assert.deepEqual(normalizeNotificationBackfillQuery('SELECT ?', [15]), { sql: 'SELECT ?', params: [15] });
});

test('approved machine-event rewrite does not mutate unrelated SQL or parameters', () => {
  const sql = "SELECT * FROM machine_production_events WHERE status='pending' AND machine_code=?";
  const params = ['M-1'];
  assert.deepEqual(normalizeApprovedMachineEventQuery(sql, params), { sql, params });
  assert.deepEqual(params, ['M-1']);
});
