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

test('service worker release invalidates stale cache namespaces', () => {
  const sw = read('public/sw.js');
  const version = sw.match(/const BUILD_VERSION = "([^"]+)";/);
  assert.ok(version, 'service worker must declare a build version');
  assert.ok(version[1].trim().length > 0, 'build version must not be empty');
  assert.match(sw, /const APP_CACHE = `ktc-\$\{BUILD_VERSION\}-app`;/);
  assert.match(sw, /const STATIC_CACHE = `ktc-\$\{BUILD_VERSION\}-static`;/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
  assert.match(sw, /keys\.filter\(\(key\) => key !== APP_CACHE && key !== STATIC_CACHE\)\.map\(\(key\) => caches\.delete\(key\)\)/);
});
