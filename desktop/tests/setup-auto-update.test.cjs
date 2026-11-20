'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveUpdateChannel } = require('../electron/updateChannel.cjs');

test('TEST installers subscribe only to beta updates', () => {
  assert.deepEqual(resolveUpdateChannel('test'), { channel: 'beta', allowPrerelease: true });
});
test('production installers subscribe only to stable updates', () => {
  assert.deepEqual(resolveUpdateChannel('production'), { channel: 'latest', allowPrerelease: false });
});
test('unknown deployment profile fails closed', () => {
  assert.throws(() => resolveUpdateChannel('staging'));
});
test('updater starts after launch and does not silently install on quit', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../electron/autoUpdate.cjs'), 'utf8');
  const launcher = fs.readFileSync(path.resolve(__dirname, '../electron/launcher.cjs'), 'utf8');
  assert.match(source, /autoUpdater\.channel = updateSettings\.channel/);
  assert.match(source, /autoUpdater\.autoInstallOnAppQuit = false/);
  assert.match(source, /isPortableBuild\(\)/);
  assert.match(launcher, /AUTO_UPDATER_LOADED_AFTER_STARTUP/);
});

test('TEST Setup release workflow pins GitHub beta channel and requires beta manifest', () => {
  const profile = require('../electron-builder.test-beta.cjs');
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/publish-desktop-test-beta.yml'), 'utf8');
  const baseBuild = require('../package.json').build;
  assert.equal(profile.appId, baseBuild.appId);
  assert.deepEqual(profile.nsis, baseBuild.nsis);
  assert.deepEqual(profile.extraResources, baseBuild.extraResources);
  assert.equal(profile.publish[0].provider, 'github');
  assert.equal(profile.publish[0].channel, 'beta');
  assert.match(workflow, /--config electron-builder\.test-beta\.cjs/);
  assert.match(workflow, /release\/beta\.yml/);
  assert.match(workflow, /--prerelease --latest=false/);
});

test('TEST beta release auto-selects versions without manual semver input', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/publish-desktop-test-beta.yml'), 'utf8');
  const dispatch = workflow.slice(workflow.indexOf('on:'), workflow.indexOf('permissions:'));
  assert.doesNotMatch(dispatch, /version:/, 'manual version field must stay disabled');
  assert.match(workflow, /node scripts\/resolveTestBetaVersion\.cjs/);
  assert.match(workflow, /npm version \$env:RELEASE_VERSION/);
});

