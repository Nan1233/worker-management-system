const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('global feedback styles are loaded and do not block controls', () => {
  const app = read('src/App.tsx');
  const css = read('src/components/feedback/toast.css');
  assert.match(app, /components\/feedback\/toast\.css/);
  assert.match(css, /\.ktc-toast-container\s*\{[\s\S]*pointer-events:\s*none\s*!important/);
  assert.match(css, /\.ktc-toast-container\s*>\s*\.ktc-toast\s*\{[\s\S]*pointer-events:\s*auto/);
});

test('service worker click-fix release invalidates stale cache namespace', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /BUILD_VERSION\s*=\s*"1\.9\.14/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});
