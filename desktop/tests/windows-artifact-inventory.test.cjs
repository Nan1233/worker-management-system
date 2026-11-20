'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { REQUIRED, verifyWindowsArtifactInventory } = require('../scripts/windowsArtifactInventory.cjs');

test('Windows staging gate requires NSIS setup and portable executable', () => {
  assert.deepEqual(REQUIRED, [
    'KTC-Production-Control-Setup.exe',
    'KTC-Production-Control.exe',
  ]);
  const onlySetup = verifyWindowsArtifactInventory([{ name: REQUIRED[0], size: 1024 }]);
  assert.equal(onlySetup.ok, false);
  assert.deepEqual(onlySetup.issues, [`missing ${REQUIRED[1]}`]);
  const onlyPortable = verifyWindowsArtifactInventory([{ name: REQUIRED[1], size: 1024 }]);
  assert.equal(onlyPortable.ok, false);
  assert.deepEqual(onlyPortable.issues, [`missing ${REQUIRED[0]}`]);
});

test('both files must be nonempty; unrelated executable cannot substitute', () => {
  const noBytes = verifyWindowsArtifactInventory([
    { name: REQUIRED[0], size: 2048 },
    { name: REQUIRED[1], size: 0 },
    { name: 'unrelated.exe', size: 20000 },
  ]);
  assert.equal(noBytes.ok, false);
  assert.deepEqual(noBytes.issues, [`empty ${REQUIRED[1]}`]);
  const valid = verifyWindowsArtifactInventory([
    { name: REQUIRED[0], size: 4096 },
    { name: REQUIRED[1], size: 8192 },
  ]);
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.issues, []);
});
