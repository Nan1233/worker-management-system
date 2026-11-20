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
  const profile = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../electron-builder.test-beta.json'), 'utf8'));
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/publish-desktop-test-beta.yml'), 'utf8');
  assert.equal(profile.publish[0].provider, 'github');
  assert.equal(profile.publish[0].channel, 'beta');
  assert.match(workflow, /--config electron-builder\.test-beta\.json/);
  assert.match(workflow, /release\/beta\.yml/);
  assert.match(workflow, /--prerelease --latest=false/);
});

test('TEST release version validation explicitly clears missing gh release exit code', () => {
  const workflow = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/publish-desktop-test-beta.yml'), 'utf8');
  const start = workflow.indexOf('      - name: Validate release version and uniqueness');
  const end = workflow.indexOf('      - name: Install dependencies', start);
  assert.ok(start >= 0 && end > start, 'version validation step must exist');
  const validation = workflow.slice(start, end);
  assert.match(validation, /gh release view/);
  assert.match(validation, /if \(\$LASTEXITCODE -eq 0\)/);
  assert.match(validation, /Write-Host "Validated beta release: \$normalized"[\s\S]*?exit 0/, 'PowerShell must exit success after gh returns 1 for missing prerelease');
});
