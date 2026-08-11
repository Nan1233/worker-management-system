const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('approved report editing requires an audit reason in the UI', () => {
  const source = read('src/pages/manager/EditReport.tsx');
  assert.match(source, /source === "approved" && !changeReason\.trim\(\)/);
  assert.match(source, /Lý do chỉnh sửa/);
  assert.match(source, /reason: source === "approved" \? changeReason\.trim\(\) : undefined/);
});

test('approved report delete API sends an explicit deletion reason', () => {
  const source = read('src/services/productionService.ts');
  assert.match(source, /deleteReport = async\(/);
  assert.match(source, /\{ data: \{ reason: String\(reason \|\| ""\)\.trim\(\) \} \}/);
});

test('frontend fallback version matches its package version', () => {
  const pkg = JSON.parse(read('package.json'));
  const source = read('src/config/version.ts');
  assert.ok(source.includes(`VITE_BUILD_VERSION || "${pkg.version}"`));
});

test('service worker cache namespace tracks the current stabilization release', () => {
  const pkg = JSON.parse(read('package.json'));
  const sw = read('public/sw.js');
  assert.match(sw, new RegExp(pkg.version.replaceAll('.', '\\.') + '-layout-contrast-fix-20260811'));
  assert.match(sw, /if \(isApiRequest\(url\)\) return/);
});

test('permissions UI uses theme tokens instead of a light-only surface', () => {
  const css = read('src/pages/admin/Permissions.css');
  assert.match(css, /\.permission-card,.permission-loading\{background:var\(--ktc-surface/);
  assert.match(css, /background:var\(--ktc-surface-muted/);
  assert.match(css, /color:var\(--ktc-ink-900/);
});

test('production dependency audit command is available without forcing breaking upgrades', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['audit:prod'], 'npm audit --omit=dev --audit-level=high');
});
