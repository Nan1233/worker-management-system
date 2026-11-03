'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PROFILES, resolveDesktopDeploymentProfile } = require('../electron/deploymentProfile.cjs');

const desktopRoot = path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(desktopRoot, file), 'utf8'));

test('Desktop defaults to TEST and has an explicit production packaging profile', () => {
  const pkg = readJson('package.json');
  const productionBuilder = readJson('electron-builder.production.json');
  assert.equal(pkg.ktcDeploymentEnvironment, 'test');
  assert.equal(productionBuilder.extraMetadata.ktcDeploymentEnvironment, 'production');
  assert.equal(productionBuilder.extends, './package.json');
  const launcher = fs.readFileSync(path.join(desktopRoot, 'electron/launcher.cjs'), 'utf8');
  assert.match(launcher, /desktopPackage\.ktcDeploymentEnvironment/);
  assert.match(launcher, /resolveDesktopDeploymentProfile/);
  assert.equal(launcher.includes('ktc-be-test.nan978971.workers.dev'), false);
});

test('Desktop TEST and production profiles map only to their matching Cloudflare endpoints', () => {
  assert.equal(resolveDesktopDeploymentProfile('test').apiUrl, 'https://ktc-be-test.nan978971.workers.dev/api');
  assert.equal(resolveDesktopDeploymentProfile('test').frontendUrl, 'https://ktc-fe-test.nan978971.workers.dev');
  assert.equal(resolveDesktopDeploymentProfile('production').apiUrl, 'https://ktc-be.nan978971.workers.dev/api');
  assert.equal(resolveDesktopDeploymentProfile('production').frontendUrl, 'https://ktc-frontend.nan978971.workers.dev');
  assert.notEqual(PROFILES.test.apiUrl, PROFILES.production.apiUrl);
});

test('Desktop deployment profile fails closed for unknown values', () => {
  assert.throws(() => resolveDesktopDeploymentProfile('staging'), {
    code: 'DESKTOP_DEPLOYMENT_PROFILE_INVALID',
  });
});
