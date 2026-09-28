'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'backend/cloudflare-worker.js'), 'utf8');
const seed = fs.readFileSync(path.join(root, 'backend/scripts/ensureGcLong2801Lt.js'), 'utf8');
const smoke = fs.readFileSync(path.join(root, 'scripts/cloudflareProductionSmoke.cjs'), 'utf8');

test('Cloudflare adapter uses cloudflare:node HTTP handler with the configured port', () => {
  assert.match(worker, /import\s+\{\s*httpServerHandler\s*\}\s+from\s+["']cloudflare:node["']/);
  assert.match(worker, /const\s+httpHandler\s*=\s*httpServerHandler\(\{\s*port:\s*Number\(process\.env\.PORT\s*\|\|\s*3000\)\s*\}\)/);
  assert.doesNotMatch(worker, /return\s+server\.fetch\(/);
});

test('Legacy 2801-LT seed is a no-op and does not inject obsolete master data', () => {
  assert.match(seed, /Legacy bootstrap compatibility only/);
  assert.match(seed, /QC3-2801/);
  assert.doesNotMatch(seed, /INSERT\s+INTO/i);
  assert.doesNotMatch(seed, /2801-LT.*605|605.*2801-LT/);
});

test('Cloudflare production smoke test stays non-destructive for production business data', () => {
  assert.match(smoke, /Read-only Cloudflare production smoke test/);
  assert.doesNotMatch(smoke, /POST',\s*'\/api\/production-temp/);
  assert.doesNotMatch(smoke, /approve-selected|reject-selected|DELETE\s+\/api\/production/i);
});
