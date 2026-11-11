'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backend = fs.readFileSync(path.join(__dirname, '../services/permissionService.js'), 'utf8');
const frontend = fs.readFileSync(path.join(__dirname, '../../frontend/src/security/permissions.ts'), 'utf8');

function namedPermissionList(source, role) {
  const match = source.match(new RegExp('\\b' + role + ':\\s*\\[([^\\]]*)\\]'));
  assert.ok(match, 'missing role: ' + role);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]).sort();
}

test('role permission additions in FE mirror BE for every role except admin (all)', () => {
  for (const role of ['worker', 'lead', 'manager', 'admin_ops']) {
    assert.deepEqual(
      namedPermissionList(frontend, role),
      namedPermissionList(backend, role),
      'mismatched capabilities for ' + role
    );
  }
});

test('worker context exclusion list matches backend', () => {
  const pattern = /(?:workerContextPermissions|WORKER_CONTEXT_PERMISSIONS)\s*=\s*new Set(?:<PermissionCode>)?\(\[([^\]]+)\]\)/;
  const fe = frontend.match(pattern);
  const be = backend.match(pattern);
  assert.ok(fe);
  assert.ok(be);
  const parse = (value) => [...value.matchAll(/'([^']+)'/g)].map((item) => item[1]).sort();
  assert.deepEqual(parse(fe[1]), parse(be[1]));
});
