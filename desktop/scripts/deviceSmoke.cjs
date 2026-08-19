#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const release = path.join(__dirname, '..', 'release');
if (process.platform !== 'win32') {
  console.error('EXE DEVICE GATE: BLOCKED — run on real Windows.'); process.exit(2);
}
if (!fs.existsSync(release)) {
  console.error('EXE DEVICE GATE: FAIL — build release first with npm run dist:win.'); process.exit(2);
}
const files = fs.readdirSync(release).filter(f => /KTC-Production-Control.*\.(exe|msi)$/i.test(f));
if (!files.length) {
  console.error('EXE DEVICE GATE: FAIL — no Windows artifact found in desktop/release.'); process.exit(2);
}
console.log(`EXE DEVICE GATE: PASS — found ${files.length} Windows artifact(s):`);
for (const f of files) console.log(`  ${f}`);
console.log('Manual gate: install -> login -> API -> Excel -> restart/update -> uninstall/reinstall.');
