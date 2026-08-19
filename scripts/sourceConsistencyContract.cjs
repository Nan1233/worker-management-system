#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const frontend = path.join(root, 'frontend');

function mustExist(relativePath) {
  const target = path.join(root, relativePath);
  assert.ok(fs.existsSync(target), `missing canonical path: ${relativePath}`);
}

function mustNotExist(relativePath) {
  const target = path.join(root, relativePath);
  assert.ok(!fs.existsSync(target), `stale duplicate path must not exist: ${relativePath}`);
}

// Canonical application source is frontend/. Root is orchestration only.
// This prevents Render, Desktop and Capacitor from consuming different source trees.
for (const file of [
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/index.html',
  'frontend/vite.config.ts',
  'frontend/tsconfig.app.json',
  'frontend/tsconfig.node.json',
  'frontend/tsconfig.json',
  'frontend/capacitor.config.ts',
  'frontend/render.yaml',
  'frontend/src',
  'frontend/public',
  'frontend/android'
]) mustExist(file);

for (const stale of [
  'src',
  'public',
  'index.html',
  'vite.config.ts',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'tsconfig.json',
  'capacitor.config.ts',
  'android'
]) mustNotExist(stale);


function assertNoEmptySourceFiles(dir) {
  const allowed = new Set();
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(js|cjs|mjs|ts|tsx|css|json)$/i.test(entry.name)) {
        assert.notEqual(fs.statSync(full).size, 0, `empty source file: ${path.relative(root, full)}`);
      }
    }
  }
}
assertNoEmptySourceFiles(frontend);

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.match(rootPkg.scripts.build, /^npm --prefix frontend run build$/);
assert.match(rootPkg.scripts.check, /^npm --prefix frontend run check$/);
assert.match(rootPkg.scripts['android:sync'], /^npm --prefix frontend run android:sync$/);
assert.match(rootPkg.scripts['ios:sync'], /^npm --prefix frontend run ios:sync$/);

const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
assert.match(render, /rootDir:\s*frontend/);
assert.match(render, /buildCommand:\s*npm ci && npm run build/);
assert.match(render, /staticPublishPath:\s*\.\/dist/);
assert.match(render, /name:\s*worker-management-system-2/);
assert.match(render, /rootDir:\s*backend/);
assert.match(render, /startCommand:\s*npm start/);
assert.match(render, /healthCheckPath:\s*\/api\/health\/ready/);

console.log('[KTC] canonical source contract PASS: frontend/ is the sole web/mobile source tree');
