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

  try {
    await assertWritable(getExportRoot(), 'Excel export folder');
  } catch (error) {
    // The build machine may not have access to the company's NAS.
    // Do not change the runtime export path or production behavior;
    // simply allow packaging to continue and let the real target machine
    // validate/write the configured export location at runtime.
    console.warn('[WARN] Excel export folder is not writable on this build machine; continuing preflight:', error?.message || error);
  }

  console.log('[PASS] Desktop preflight completed');
})().catch((error) => {
  console.error('[FAIL] Desktop preflight:', error?.stack || error);
  process.exitCode = 1;
});
