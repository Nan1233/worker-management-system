'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { READ_ONLY_CHECKS, guardReadOnlySql, checkEnvironment, runAudit } = require('../scripts/phase2ReadOnlyAudit.cjs');

const goodEnv = {
  KTC_PHASE2_READ_ONLY: '1', KTC_PHASE2_TARGET: 'staging',
  DB_HOST: 'test.example.invalid', DB_USER: 'readonly', DB_PASSWORD: 'dummy', DB_NAME: 'ktc_staging'
};

test('phase2 always requires explicit staging confirmation and DB variables before connecting', () => {
  assert.throws(() => checkEnvironment({ ...goodEnv, KTC_PHASE2_TARGET: 'production' }), /PHASE2_STAGING_READ_ONLY_CONFIRMATION_REQUIRED/);
  assert.throws(() => checkEnvironment({ ...goodEnv, KTC_PHASE2_READ_ONLY: '0' }), /PHASE2_STAGING_READ_ONLY_CONFIRMATION_REQUIRED/);
  assert.throws(() => checkEnvironment({ ...goodEnv, DB_PASSWORD: '' }), /PHASE2_TEST_DB_CONNECTION_INCOMPLETE/);
  assert.doesNotThrow(() => checkEnvironment(goodEnv));
});

test('every staging audit statement is a single read-only SELECT and never exposes report rows', () => {
  assert.ok(READ_ONLY_CHECKS.length >= 6);
  for (const check of READ_ONLY_CHECKS) {
    assert.doesNotThrow(() => guardReadOnlySql(check.sql), check.id);
    assert.match(check.sql, /^SELECT\b/);
    assert.match(check.sql, /COUNT\(/i);
  }
  for (const sql of ['DELETE FROM production_reports', 'UPDATE workers SET status=1', 'SELECT 1; DELETE FROM users', 'SELECT * FROM t FOR UPDATE', 'SELECT * INTO OUTFILE \'x\' FROM users']) {
    assert.throws(() => guardReadOnlySql(sql), /PHASE2_WRITE_OR_UNSAFE_QUERY_BLOCKED/);
  }
});

test('all clean staging integrity counters pass without exposing sensitive records', async () => {
  const result = await runAudit(async (sql) => {
    if (/status IN \('pending','need_fix'\)/.test(sql)) return [{ total: 6 }];
    if (/FROM production_reports WHERE status='approved'/.test(sql)) return [{ total: 12 }];
    if (/GROUP BY a.id HAVING COUNT\(l.id\)=0/.test(sql)) return [];
    return [{ total: 0 }];
  });
  assert.equal(result.passed, true);
  assert.equal(result.read_only, true);
  assert.equal(result.environment, 'staging');
  assert.equal(result.checks.find((row) => row.check === 'APPROVED_REPORTS').count, 12);
  assert.equal(result.checks.every((row) => Object.keys(row).sort().join(',') === 'check,count,passed,severity'), true);
});

test('duplicate approved source or missing machine lines fail closed', async () => {
  const result = await runAudit(async (sql) => {
    if (/HAVING COUNT\(\*\)>1/.test(sql)) return [{ total: 2 }];
    if (/GROUP BY a.id HAVING COUNT\(l.id\)=0/.test(sql)) return [{ total: 1 }, { total: 1 }];
    return [{ total: 0 }];
  });
  assert.equal(result.passed, false);
  assert.equal(result.checks.find((row) => row.check === 'DUPLICATE_APPROVED_SOURCE').count, 2);
  assert.equal(result.checks.find((row) => row.check === 'APPROVED_MACHINE_REPORTS_WITHOUT_LINES').count, 2);
});

test('real-data validation query has no trailing comma before FROM', () => {
  const script = fs.readFileSync(path.join(__dirname, '../scripts/validateRealProductionData.js'), 'utf8');
  assert.match(script, /pr\.training_percent_snapshot AS training_percent\s+FROM production_reports pr/);
  assert.doesNotMatch(script, /AS training_percent,\s+FROM production_reports pr/);
});
