const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('application content is above decorative layers and native controls remain clickable', () => {
  const css = read('src/styles/interaction-hardening.css');
  assert.match(css, /z-index:\s*10;\s*pointer-events:\s*auto/);
  assert.match(css, /:where\(button, a, input, select, textarea, summary, \[role="button"\], label\)/);
  assert.match(css, /z-index:\s*11;\s*pointer-events:\s*auto/);
  assert.match(css, /\.worker-layout::before[\s\S]*pointer-events:\s*none !important/);
  assert.match(css, /\.management-layout::after[\s\S]*pointer-events:\s*none !important/);
});

test('service worker click-fix release invalidates stale cache namespace', () => {
  const sw = read('public/sw.js');
  assert.match(sw, /1\.8\.18-mobile-nav-click-fix-20260817/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});
