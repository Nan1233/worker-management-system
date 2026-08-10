const fs = require('node:fs');
const path = require('node:path');
const { getExportRoot } = require('../electron/excelPaths.cjs');
const { getDesktopDataRoot } = require('../electron/platformPaths.cjs');

const checks = [
  ['Platform supported', ['win32','darwin','linux'].includes(process.platform), `${process.platform}/${process.arch}`],
  ['Desktop data path is platform-native', !getDesktopDataRoot().includes(process.platform === 'darwin' ? 'AppData' : '__never__'), getDesktopDataRoot()],
  ['Export path resolved', path.isAbsolute(getExportRoot()), getExportRoot()],
  ['Packaged frontend contract exists', fs.existsSync(path.join(__dirname, '..', 'electron', 'preload.cjs')), 'preload.cjs'],
];
let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}: ${detail}`);
  if (!ok) failed += 1;
}
if (failed) process.exitCode = 1;
else console.log('[PASS] Desktop field-readiness source checks completed');
