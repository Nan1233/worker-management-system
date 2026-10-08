'use strict';

// Desktop checks that run on plain Node. Anything that needs the Electron binary,
// a real Windows session or a native dialog is in MANUAL_CHECKLIST.md.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const config = require('../lib/config.cjs');
const { writeArtifact } = require('../lib/reporter.cjs');

const DESKTOP = path.join(config.ROOT, 'desktop');
const depsMissing = !fs.existsSync(path.join(DESKTOP, 'node_modules', 'exceljs'))
  ? 'desktop/node_modules missing (run: cd desktop && npm ci --omit=dev --ignore-scripts)'
  : false;
const electronMissing = (() => {
  try { require.resolve('electron', { paths: [DESKTOP] }); return false; } catch { return 'Electron is not installed in this environment (by decision); launching the app is in test/e2e/desktop/MANUAL_CHECKLIST.md'; }
})();

function run(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: DESKTOP, encoding: 'utf8', timeout: 120_000 });
  writeArtifact('desktop', `${path.basename(script)}.log`, `${result.stdout || ''}\n${result.stderr || ''}`);
  return result;
}

const sources = (dir) => fs.readdirSync(path.join(DESKTOP, dir)).filter((f) => /\.(c?js)$/.test(f)).map((f) => path.join(dir, f));

test('node --check: every desktop electron/ and scripts/ source parses', () => {
  const files = [...sources('electron'), ...sources('scripts'), 'start-router.cjs'];
  const failures = [];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: DESKTOP, encoding: 'utf8' });
    if (result.status !== 0) failures.push(`${file}: ${String(result.stderr).split('\n').slice(0, 4).join(' ')}`);
  }
  assert.ok(files.length > 20, `expected the desktop sources, found ${files.length}`);
  assert.deepEqual(failures, []);
});

test('scripts/checkExcelDbSync.cjs (existing contract) passes', () => {
  const result = run('scripts/checkExcelDbSync.cjs');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('scripts/checkPlatformPaths.cjs (existing contract) passes', () => {
  const result = run('scripts/checkPlatformPaths.cjs');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('scripts/checkPackagedSharedContract.cjs (existing contract) passes', () => {
  const result = run('scripts/checkPackagedSharedContract.cjs');
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('scripts/fieldReadiness.cjs: platform-independent checks pass', () => {
  const result = run('scripts/fieldReadiness.cjs');
  const lines = String(result.stdout).split('\n').filter((l) => /^\[(PASS|FAIL)\]/.test(l));
  const failed = lines.filter((l) => l.startsWith('[FAIL]') && !l.includes('Export path resolved'));
  assert.ok(lines.length >= 4, result.stdout);
  assert.deepEqual(failed, []);
});

test('scripts/fieldReadiness.cjs: export path is an absolute Windows path', { skip: config.isWindows() ? false : 'Export root is a Windows UNC path (\\\\KTCNAS\\...); path.isAbsolute only accepts it on win32. Run on Windows (test/e2e/desktop/MANUAL_CHECKLIST.md §2).' }, () => {
  const result = run('scripts/fieldReadiness.cjs');
  assert.match(result.stdout, /\[PASS\] Export path resolved/);
});

test('scripts/smokeExcel.cjs (existing desktop Excel smoke) passes', { skip: depsMissing }, () => {
  const result = run('scripts/smokeExcel.cjs');
  assert.equal(result.status, 0, `${result.stderr || result.stdout}`.split('\n').slice(0, 6).join('\n'));
});

test('Electron app starts (main window, preload, IPC live)', {
  skip: electronMissing || 'App launch needs a display, a logged-in backend session and the NAS export root; it is a manual step (test/e2e/desktop/MANUAL_CHECKLIST.md)'
}, () => {});
