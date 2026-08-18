#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

function checkLock(dir) {
  const pkg = readJson(`${dir}/package.json`);
  const lockPath = path.join(root, dir, 'package-lock.json');
  assert.ok(fs.existsSync(lockPath), `${dir}/package-lock.json missing`);
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  assert.equal(lock.lockfileVersion, 3, `${dir}: lockfileVersion must be 3`);
  assert.equal(lock.name, pkg.name, `${dir}: lock package name drift`);
  assert.equal(lock.version, pkg.version, `${dir}: lock version drift`);
  assert.equal(lock.packages[''].name, pkg.name, `${dir}: root lock package name drift`);
  assert.equal(lock.packages[''].version, pkg.version, `${dir}: root lock package version drift`);

  for (const section of ['dependencies', 'devDependencies']) {
    assert.deepEqual(
      lock.packages[''][section] || {},
      pkg[section] || {},
      `${dir}: ${section} manifest/lock drift`
    );
  }
}

checkLock('.');
checkLock('frontend');
checkLock('desktop');

// Backend intentionally uses npm install rather than npm ci in the current
// release policy; never silently accept a backend lockfile reappearing.
assert.equal(
  fs.existsSync(path.join(root, 'backend', 'package-lock.json')),
  false,
  'backend/package-lock.json violates the current release policy'
);

// Capacitor native commands must be explicit and non-recursive.
const frontendPkg = readJson('frontend/package.json');
assert.equal(
  frontendPkg.scripts['ios:doctor'],
  'npm run ios:prepare && cap doctor',
  'frontend ios:doctor must not recursively invoke itself'
);
assert.ok(frontendPkg.scripts['ios:doctor:production'], 'frontend iOS production doctor missing');
assert.ok(frontendPkg.scripts['ios:release:check'], 'frontend iOS release check missing');

console.log('[KTC] Dependency/release contract PASS');
