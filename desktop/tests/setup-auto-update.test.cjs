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
