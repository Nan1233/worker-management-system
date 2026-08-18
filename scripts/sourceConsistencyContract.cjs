#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function snapshot(relativeDir) {
  const base = path.join(root, relativeDir);
  return new Map(
    walk(base)
      .map(file => [
        path.relative(base, file).replaceAll(path.sep, '/'),
        crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
      ])
  );
}

function assertMirrored(leftDir, rightDir, label) {
  const left = snapshot(leftDir);
  const right = snapshot(rightDir);
  assert.deepEqual(
    [...left.keys()].sort(),
    [...right.keys()].sort(),
    `${label}: file set drift`
  );

  const drift = [];
  for (const [file, hash] of left) {
    if (right.get(file) !== hash) drift.push(file);
  }
  assert.deepEqual(drift, [], `${label}: content drift: ${drift.join(', ')}`);
}

// Render builds the repository root. Desktop/mobile builds use frontend/.
// They must consume exactly the same application source.
assertMirrored('src', 'frontend/src', 'root src <-> frontend/src');

// Native projects are generated/maintained in two locations by the current
// release layout. Until the repository is structurally consolidated, drift
// between them must be impossible to miss.
assertMirrored('android', 'frontend/android', 'root android <-> frontend/android');

for (const file of [
  'index.html',
  'vite.config.ts',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'capacitor.config.ts'
]) {
  const rootFile = fs.readFileSync(path.join(root, file));
  const frontendFile = fs.readFileSync(path.join(root, 'frontend', file));
  assert.deepEqual(rootFile, frontendFile, `${file}: root/frontend config drift`);
}

const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
assert.match(render, /buildCommand:\s*npm ci && npm run check/);

console.log('[KTC] source consistency contract PASS');
