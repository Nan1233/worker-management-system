'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../src/pages/admin/Permissions.css'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../src/pages/admin/Permissions.tsx'), 'utf8');
const backend = fs.readFileSync(path.join(__dirname, '../../backend/routes/adminControlRoutes.js'), 'utf8');

test('Admin permission page keeps narrow screen scroll inside matrix and allows readable select inputs', () => {
  assert.match(css, /\.permission-page \.permission-table-wrap\{max-height:60vh\}/);
  assert.match(css, /\.permission-page \.permission-table-wrap \{ width: 100%; max-width: 100%; \}/);
  assert.match(css, /font-size:16px/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(page, /role="region" aria-label="Ma trận phân quyền theo vai trò, có thể cuộn ngang"/);
});

test('Admin permission page dark theme retains readable alerts, controls, group headings', () => {
  for (const suffix of ['.permission-feedback.success', '.permission-feedback.error', '.permission-feedback.working', '.permission-card', '.permission-refresh', '.module-row td']) {
    assert.ok(css.includes('[data-theme="dark"] .permission-page ' + suffix), 'dark CSS missing '+suffix);
  }
  assert.doesNotMatch(css, /body\s*\{\s*background/);
});

test('Backend enforces role, DB-backed super-admin status and per-endpoint permission independently from CSS', () => {
  assert.match(backend, /router\.use\(auth, role\('admin'\)\)/);
  assert.match(backend, /req\.user\?\.is_super_admin === true/);
  assert.match(backend, /SUPER_ADMIN_REQUIRED/);
  assert.match(backend, /permission\('USER_EDIT'\)/);
  assert.match(backend, /guardPrivilegedTarget\(\)/);
});
