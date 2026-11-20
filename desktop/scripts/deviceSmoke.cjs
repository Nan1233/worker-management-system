#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { verifyWindowsArtifactInventory } = require('./windowsArtifactInventory.cjs');

const release = path.join(__dirname, '..', 'release');
if (process.platform !== 'win32') {
  console.error('EXE DEVICE GATE: BLOCKED — run on real Windows.');
  process.exit(2);
}
if (!fs.existsSync(release)) {
  console.error('EXE DEVICE GATE: FAIL — build release first with npm run dist:win:test.');
  process.exit(2);
}
const artifacts = fs.readdirSync(release)
  .map(name => {
    const absolute = path.join(release, name);
    const stat = fs.statSync(absolute);
    return { name, size: stat.isFile() ? stat.size : 0 };
  });
const verified = verifyWindowsArtifactInventory(artifacts);
if (!verified.ok) {
  console.error('EXE DEVICE GATE: FAIL — ' + verified.issues.join('; '));
  process.exit(2);
}
console.log('EXE DEVICE GATE: PASS — both Setup and Portable STAGING artifacts exist:');
for (const entry of verified.artifacts) console.log(`  ${entry.name} (${entry.size} bytes)`);
console.log('Manual gate not done: install -> login TEST -> Excel -> restart/update -> uninstall/reinstall.');
