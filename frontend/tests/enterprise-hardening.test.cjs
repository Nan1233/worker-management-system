const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('approved report editing requires an audit reason in the UI', () => {
  const source = read('src/pages/worker/WorkerReportEditV2.tsx');
  assert.match(source, /source === "approved" && !changeReason\.trim\(\)/);
  assert.match(source, /changeReason/);
  assert.match(source, /reason: source === "approved" \? changeReason\.trim\(\) : undefined/);
});

test('approved report delete API sends an explicit deletion reason', () => {
  const source = read('src/services/productionService.ts');
  assert.match(source, /deleteReport\s*=\s*async\s*/);
  assert.match(source, /data\s*:\s*\{\s*reason\s*:\s*String\(reason\s*\|\|\s*""\)\.trim\(\)\s*\}/);
});

test('frontend fallback build version matches the declared frontend release version', () => {
  const source = read('src/config/version.ts');
  assert.match(source, /FRONTEND_VERSION = "([^"]+)"/);
  assert.match(source, /VITE_BUILD_VERSION = String\(import\.meta\.env\.VITE_BUILD_VERSION \|\| FRONTEND_VERSION\)/);
});

test('service worker cache namespace tracks the frontend release and bypasses API requests', () => {
  const versionSource = read('src/config/version.ts');
  const sw = read('public/sw.js');
  const releaseVersion = versionSource.match(/FRONTEND_VERSION = "([^"]+)"/)?.[1];
  const cacheVersion = sw.match(/const BUILD_VERSION = "([^"]+)"/)?.[1];
  assert.ok(releaseVersion, 'frontend release version must be declared');
  assert.ok(cacheVersion?.startsWith(releaseVersion), 'service worker cache namespace must track the current frontend release');
  assert.match(sw, /if \(url\.origin !== self\.location\.origin \|\| isApiRequest\(url\)\) return/);
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
