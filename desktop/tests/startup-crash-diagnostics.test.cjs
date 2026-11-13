'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const launcher = fs.readFileSync(path.join(__dirname, '../electron/launcher.cjs'), 'utf8');

test('startup failures are logged without overriding uncaught exception handling', () => {
  assert.match(launcher, /uncaughtExceptionMonitor/);
  assert.match(launcher, /MAIN_UNCAUGHT_EXCEPTION/);
  assert.match(launcher, /MAIN_UNHANDLED_REJECTION/);
  assert.match(launcher, /ELECTRON_CHILD_PROCESS_GONE/);
  assert.doesNotMatch(launcher, /process\.on\('uncaughtException',/);
});

test('startup crash log does not serialize entire error or environment', () => {
  assert.match(launcher, /safeCrashSummary\(reason\)/);
  assert.doesNotMatch(launcher, /JSON\.stringify\(process\.env\)/);
});
