'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { sanitizeLogDetails, redactSensitiveText, safeUrlForLog } = require('../electron/desktopLog.cjs');

test('renderer messages and crashes never log bearer/session/query secrets or local user paths', () => {
  const message = "Error: Bearer abc.def.ghi authorization=topsecret access_token=TOKEN password: letmein at C:\\Users\\Alice\\KTC\\error.log";
  const safe = redactSensitiveText(message);
  for (const secret of ['abc.def.ghi', 'topsecret', 'TOKEN', 'letmein', 'Alice']) {
    assert.ok(!safe.includes(secret), 'leak: ' + secret);
  }
  assert.match(safe, /Bearer \[REDACTED\]/);
  assert.match(safe, /\[PATH_REDACTED\]/);
  assert.equal(safeUrlForLog('https://example.test/api/sync?access_token=TOKEN#private'),
    'https://example.test/api/sync');
  const nested = sanitizeLogDetails({
    token: 'TOKEN', message: 'Bearer abc.def.ghi',
    validatedURL: 'https://example.test/#/worker?token=SECRET',
    exportRoot: 'C:\\Users\\Alice\\Documents\\KTC',
    extra: [{ error: 'password=hidden' }],
  });
  assert.equal(nested.token, '[REDACTED]');
  assert.equal(nested.message, 'Bearer [REDACTED]');
  assert.equal(nested.validatedURL, 'https://example.test/');
  assert.ok(!JSON.stringify(nested).includes('Alice'));
  assert.ok(!JSON.stringify(nested).includes('SECRET'));
  assert.equal(nested.extra[0].error, 'password=[REDACTED]');
});

test('launcher uses structured log sanitizer and keeps crash monitor, startup markers and update ordering', () => {
  const launcher = fs.readFileSync(path.join(__dirname, '../electron/launcher.cjs'), 'utf8');
  assert.match(launcher, /\.\.\.sanitizeLogDetails\(payload\)/);
  assert.match(launcher, /function safeCrashSummary\(reason\)/);
  assert.match(launcher, /const details = sanitizeLogDetails\(/);
  assert.match(launcher, /uncaughtExceptionMonitor/);
  assert.match(launcher, /process\.on\('unhandledRejection'/);
  assert.match(launcher, /STARTUP_MAIN_REQUIRE_BEGIN/);
  assert.doesNotMatch(launcher, /require\(['"]\.\/(?:excelExportContractPatch|compactGcExcelPatch|excelReportDateSubmissionPatch)/);
  assert.ok(launcher.indexOf('STARTUP_MAIN_REQUIRE_BEGIN') < launcher.indexOf("require('./main.cjs')"));
  assert.ok(launcher.indexOf("require('./main.cjs')") < launcher.indexOf('STARTUP_MAIN_REQUIRE_END'));
});

test('preload exposes only fixed IPC methods and subscribes/unsubscribes safely', () => {
  const src = fs.readFileSync(path.join(__dirname, '../electron/preload.cjs'), 'utf8');
  const registered = new Map();
  const calls = [];
  const ipc = {
    on(channel, fn) { registered.set(channel, fn); },
    removeListener(channel, fn) { if (registered.get(channel) === fn) registered.delete(channel); },
    invoke(channel, payload) { calls.push({ channel, payload }); return Promise.resolve(true); },
    send(channel) { calls.push({ channel }); },
  };
  let exposed = null;
  const context = {
    require: (id) => id === 'electron' ?
      { contextBridge: { exposeInMainWorld: (name, value) => {
        assert.equal(name, 'ktcDesktop'); exposed = value;
      } }, ipcRenderer: ipc } : (() => { throw Error('Unexpected module: ' + id); })(),
    window: { addEventListener: () => {} },
  };
  vm.runInNewContext(src, context, { filename: 'preload.cjs' });
  assert.equal(exposed.isDesktop, true);
  assert.equal(Object.hasOwn(exposed, 'invoke'), false);
  assert.equal(Object.hasOwn(exposed, 'ipcRenderer'), false);
  for (const [name, channel] of [
    ['onSyncResult', 'ktc-excel-sync-result'],
    ['onExcelDbSyncResult', 'ktc-excel-db-sync-result'],
    ['onSyncError', 'ktc-excel-sync-error'],
  ]) {
    assert.throws(() => exposed[name](null), { name: 'TypeError' });
    let received = null;
    const off = exposed[name](value => { received = value; });
    assert.equal(typeof off, 'function');
    assert.equal(typeof registered.get(channel), 'function');
    registered.get(channel)({}, { success: true });
    assert.equal(received.success, true);
    off();
    assert.equal(registered.has(channel), false);
  }
  exposed.previewExcelDbSync('bearer-preview', '2026-11');
  assert.equal(calls.at(-1).channel, 'ktc-preview-excel-db-sync');
  assert.equal(calls.at(-1).payload.yearMonth, '2026-11');
  assert.ok(!src.includes("exposeInMainWorld('ipcRenderer'"));
});

test('main process keeps Electron sandbox, isolation and trusted navigation', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const window = fs.readFileSync(path.join(__dirname, '../electron/desktopWindow.cjs'), 'utf8');
  assert.match(main, /createDesktopWindowFactory\(/);
  assert.match(window, /contextIsolation:\s*true/);
  assert.match(window, /nodeIntegration:\s*false/);
  assert.match(window, /sandbox:\s*true/);
  assert.match(main, /isTrustedRendererNavigation/);
  assert.match(main, /ReportImportPreviewGuard/);
  assert.match(main, /isSafeExternalUrl/);
});
