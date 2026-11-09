'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const script = path.resolve(__dirname, '../scripts/stagingE2E.cjs');
function check(url, extra = {}) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, DB_NAME: 'not_e2e', LOCAL_BACKEND_URL: url, KTC_E2E_ALLOW_REMOTE_STAGING: '0', ...extra },
  });
}
test('rejects production and arbitrary remote APIs before DB guard', () => {
  for (const url of [
    'https://ktc-be.nan978971.workers.dev',
    'https://example.com',
    'https://ktc-be-test.nan978971.workers.dev',
    'https://ktc-be-test.nan978971.workers.dev/api',
    'https://user:pass@ktc-be-test.nan978971.workers.dev',
    'https://ktc-be-test.nan978971.workers.dev.evil.example',
    'not-a-url',
  ]) {
    const result = check(url);
    assert.equal(result.status, 1, url);
    assert.match(result.stderr, /KTC_STAGING_E2E_BLOCKED/, url);
  }
});
test('loopback and explicitly opted-in TEST API reach isolated DB guard', () => {
  for (const [url, extra] of [
    ['http://127.0.0.1:19080', {}],
    ['http://localhost:19080', {}],
    ['https://ktc-be-test.nan978971.workers.dev', { KTC_E2E_ALLOW_REMOTE_STAGING: '1' }],
  ]) {
    const result = check(url, extra);
    assert.equal(result.status, 2, url);
    assert.match(result.stderr, /E2E database guard failed/, url);
  }
});
