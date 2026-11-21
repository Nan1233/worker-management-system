'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'electron', name), 'utf8');

test('portable exe never invokes the installer auto-update flow', () => {
  const source = read('autoUpdate.cjs');
  assert.match(source, /PORTABLE_EXECUTABLE_FILE/);
  assert.match(source, /if \(!app\.isPackaged \|\| isPortableBuild\(\) \|\| checking\) return/);
  assert.match(source, /if \(!app\.isPackaged \|\| isPortableBuild\(\)\) return/);
});

test('persistent user data remains outside the portable exe and app resources', () => {
  const launcher = read('launcher.cjs');
  const platform = read('platformPaths.cjs');
  assert.match(launcher, /getDesktopDataRoot\(\)/);
  assert.match(launcher, /mkdirSync\(persistentUserData,\s*\{ recursive: true \}\)/);
  assert.match(platform, /KTC-Worker-Management/);
  assert.doesNotMatch(platform, /process\.resourcesPath/);
});

test('export configuration remains a file in persistent userData', () => {
  const launcher = read('launcher.cjs');
  assert.match(launcher, /CONFIG_FILE = path\.join\(app\.getPath\('userData'\), 'excel-export-config\.json'\)/);
  assert.match(launcher, /readConfiguredExportRoot\(\)/);
});
