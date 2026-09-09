'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'backend/cloudflare-worker.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'backend/scripts/ensureGcLong2801Lt.js'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'scripts/cloudflareProductionSmoke.cjs'), 'utf8');

test('Cloudflare adapter uses the HTTP handler instead of Node server.fetch', () => {
  assert.match(worker, /httpServerHandler\(server\)/);
  assert.doesNotMatch(worker, /return\s+server\.fetch\(/);
});

test('Cloudflare 2801-LT seed has no transaction-control SQL in its Worker branch', () => {
  const branch = seed.split("if (isCloudflareWorker)")[1]?.split("await query('START TRANSACTION')")[0] || '';
  assert.match(branch, /2801-LT/);
  assert.match(branch, /605/);
  assert.doesNotMatch(branch, /START TRANSACTION|COMMIT|ROLLBACK/);
});

test('Cloudflare production smoke test stays read-only', () => {
  assert.match(smoke, /Read-only Cloudflare production smoke test/);
  assert.doesNotMatch(smoke, /POST',\s*'\/api\/production-temp/);
  assert.doesNotMatch(smoke, /approve-selected|reject-selected|DELETE\s+/i);
});
