'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  isTrustedIpcSender, assertTrustedIpcSender, isTrustedRendererNavigation,
} = require('../electron/securityPolicy.cjs');

function createSender(url) {
  const frame = { url };
  const webContents = { mainFrame: frame };
  return { event: { sender: webContents, senderFrame: frame }, webContents };
}

test('IPC accepts only the same top-level frame and allowed deployment origin', () => {
  const url = String(process.env.KTC_WEB_ORIGIN || 'https://ktc-frontend.nan978971.workers.dev') + '/#/worker';
  const { event, webContents } = createSender(url);
  assert.equal(isTrustedIpcSender(event, webContents), true);
  assert.doesNotThrow(() => assertTrustedIpcSender(event, webContents));
  assert.equal(isTrustedIpcSender({ ...event, sender: {} }, webContents), false);
  assert.equal(isTrustedIpcSender({ ...event, senderFrame: { url } }, webContents), false, 'iframe with same URL is not main frame');
  assert.equal(isTrustedIpcSender({ ...event, senderFrame: null }, webContents), false);
  assert.equal(isTrustedIpcSender(event, null), false);
});

test('IPC rejects untrusted URLs, protocol tricks and unexpected file pages', () => {
  for (const url of [
    'https://example.net/#/worker', 'https://ktc-frontend.nan978971.workers.dev.evil.net/',
    'javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd',
  ]) {
    const { event, webContents } = createSender(url);
    assert.equal(isTrustedIpcSender(event, webContents), false, url);
    assert.throws(() => assertTrustedIpcSender(event, webContents),
      e => e.code === 'KTC_IPC_UNTRUSTED_SENDER' && !/token|cookie/i.test(e.message));
  }
  const index = path.resolve('/tmp/ktc/frontend/dist/index.html');
  const allowed = createSender('file://' + index + '#/worker');
  assert.equal(isTrustedRendererNavigation(allowed.event.senderFrame.url, [index]), true);
  assert.equal(isTrustedIpcSender(allowed.event, allowed.webContents, [index]), true);
});

test('all production-capable Electron IPC handlers use the shared main-frame guard', () => {
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const launcher = fs.readFileSync(path.join(__dirname, '../electron/launcher.cjs'), 'utf8');
  const expectedMain = [
    'ktc-preview-excel-db-sync', 'ktc-preview-report-import', 'ktc-apply-report-import',
    'ktc-apply-excel-db-sync', 'ktc-save-excel', 'ktc-sync-all-excel',
    'ktc-configure-auto-sync', 'ktc-open-export-folder',
    'ktc-get-export-folder', 'ktc-open-log-folder', 'ktc-startup-diagnostics'
  ];
  const expectedLauncher = [
    'ktc-get-export-root', 'ktc-reset-export-root',
    'ktc-choose-export-root', 'ktc-save-statistics-excel',
  ];
  const records = (source) => [...source.matchAll(/ipcMain\.handle\('([^']+)',\s*([^\n]+)/g)];
  assert.equal(records(main).length, expectedMain.length);
  assert.equal(records(launcher).length, expectedLauncher.length);
  for (const [source, names, wrapper] of [
    [main, expectedMain, 'protectedDesktopIpc('],
    [launcher, expectedLauncher, 'protectedLauncherIpc(']
  ]) for (const channel of names) {
    const match = records(source).find(x=>x[1]===channel);
    assert.ok(match, channel);
    assert.ok(match[2].includes(wrapper), 'Unprotected IPC: ' + channel);
  }
  assert.match(main, /assertTrustedIpcSender\(event, mainWindow\?\.webContents, TRUSTED_RENDERER_FILES\)/);
  assert.match(launcher, /assertTrustedIpcSender\(event, owner\?\.webContents, TRUSTED_LAUNCHER_FILES\)/);
  assert.match(main, /isTrustedIpcSender\(event, mainWindow\.webContents, TRUSTED_RENDERER_FILES\)/);
  assert.match(main, /if \(!isTrustedIpcSender\(event, mainWindow\?\.webContents, TRUSTED_RENDERER_FILES\)\) return/);
});
