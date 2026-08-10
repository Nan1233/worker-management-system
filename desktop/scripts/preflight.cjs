const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { getDesktopDataRoot } = require('../electron/platformPaths.cjs');
const { getExportRoot } = require('../electron/excelPaths.cjs');

async function assertWritable(folder, label) {
  await fs.mkdir(folder, { recursive: true });
  const probe = path.join(folder, `.ktc-write-test-${process.pid}-${Date.now()}`);
  await fs.writeFile(probe, 'ok', 'utf8');
  await fs.rm(probe, { force: true });
  console.log(`[PASS] ${label}: ${folder}`);
}

(async () => {
  console.log(`[KTC] platform=${process.platform} arch=${process.arch} node=${process.version}`);
  console.log(`[KTC] home=${os.homedir()}`);
  await assertWritable(getDesktopDataRoot(), 'Desktop data folder');
  await assertWritable(getExportRoot(), 'Excel export folder');
  console.log('[PASS] Desktop preflight completed');
})().catch((error) => {
  console.error('[FAIL] Desktop preflight:', error?.stack || error);
  process.exitCode = 1;
});
