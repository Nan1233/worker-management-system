'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const runtime = fs.readFileSync(path.join(root, 'scripts', 'verifyP0Runtime.js'), 'utf8');

test('production deploy gates schema and real P0 runtime verification', () => {
  const occurrences = (render.match(/preDeployCommand:/g) || []).length;
  assert.equal(occurrences, 2, 'web and worker must both have a pre-deploy gate');
  assert.match(render, /preDeployCommand:\s*npm run db:schema:verify\s+&&\s+npm run p0:runtime:verify/);
});

test('runtime verifier remains explicitly migration-free and non-destructive', () => {
  assert.match(runtime, /does not run migrations/i);
  assert.match(runtime, /does not create production reports/i);
  assert.match(runtime, /FOR UPDATE/);
  assert.match(runtime, /production_report_duplicate_locks/);
  assert.equal(pkg.scripts['p0:runtime:verify'], 'node scripts/verifyP0Runtime.js');
  assert.equal(Boolean(pkg.scripts.migrate), false, 'runtime migration script must not be introduced');
});
