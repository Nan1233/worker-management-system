'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { bundledFrontendPath } = require('../electron/bundledFrontend.cjs');

const root = path.resolve(__dirname, '..', 'frontend', 'dist');

test('local frontend mapping allows only files within dist', () => {
  assert.equal(bundledFrontendPath(root, '/'), path.join(root, 'index.html'));
  assert.equal(bundledFrontendPath(root, '/assets/app.js'), path.join(root, 'assets', 'app.js'));
  assert.equal(bundledFrontendPath(root, '/../secrets'), null);
  assert.equal(bundledFrontendPath(root, '/%2e%2e/secrets'), null);
  assert.equal(bundledFrontendPath(root, '/%5cwindows'), null);
  assert.equal(bundledFrontendPath(root, '/%00'), null);
});

test('bundled frontend must be opt-in and use TEST endpoint only', () => {
  const pkg = require('../package.json');
  assert.notEqual(pkg.ktcBundledFrontend, true);
  assert.match(pkg.scripts['dist:portable:bundled-fe'], /ktcBundledFrontend=true/);
  assert.match(pkg.scripts['dist:portable:bundled-fe'], /compression=store/);
  assert.ok(pkg.build.files.includes('frontend/dist/**/*'));
  const launcher = fs.readFileSync(path.join(__dirname, '..', 'electron', 'launcher.cjs'), 'utf8');
  assert.match(launcher, /desktopDeployment\.environment !== 'test'/);
  assert.match(launcher, /installBundledFrontend/);
  assert.match(launcher, /require\('\.\/main\.cjs'\)/);
});

test('backend secrets are never packaged into desktop bundle', () => {
  const pkg = require('../package.json');
  assert.ok(!pkg.build.files.some((file) => String(file).includes('backend/')));
});
