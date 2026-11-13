'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
const launcher = fs.readFileSync(path.join(__dirname, '../electron/launcher.cjs'), 'utf8');

test('startup does not clear Chromium cache or service-worker storage', () => {
  assert.doesNotMatch(main, /session\.defaultSession\.clearCache\s*\(/);
  assert.doesNotMatch(main, /session\.defaultSession\.clearStorageData\s*\(/);
  assert.doesNotMatch(launcher, /webContents\.session\.clearCache\s*\(/);
});

test('startup logs window ready-to-show latency', () => {
  assert.match(main, /WINDOW_READY_TO_SHOW/);
  assert.match(main, /process\.hrtime\.bigint\(\)/);
});

test('remote frontend navigation permits HTTP cache reuse and records latency', () => {
  assert.match(launcher, /REMOTE_FE_NAVIGATION_START/);
  assert.match(launcher, /REMOTE_FE_LOADED/);
  assert.match(launcher, /startupElapsedMs\(\)/);
  assert.match(launcher, /await window\.loadURL\(FRONTEND_URL\)/);
  assert.doesNotMatch(launcher, /extraHeaders:\s*'Cache-Control: no-cache/);
});
