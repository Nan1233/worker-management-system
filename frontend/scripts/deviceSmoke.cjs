#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const args = process.argv.slice(2);
const mode = args[0] || 'android';
function run(cmd, a) {
  const r = spawnSync(cmd, a, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status || 1);
}
if (mode === 'android') {
  run(process.platform === 'win32' ? 'adb.exe' : 'adb', ['start-server']);
  const r = spawnSync(process.platform === 'win32' ? 'adb.exe' : 'adb', ['get-state'], { encoding: 'utf8' });
  if (r.status !== 0 || !/device/.test(r.stdout || '')) {
    console.error('ANDROID DEVICE GATE: FAIL — connect/unlock a real Android device with USB debugging enabled.');
    process.exit(2);
  }
  console.log('ANDROID DEVICE GATE: PASS — adb sees a real device. Now run the manual KTC smoke checklist.');
  process.exit(0);
}
if (mode === 'ios') {
  if (process.platform !== 'darwin') {
    console.error('IOS DEVICE GATE: BLOCKED — iOS physical-device verification requires macOS + Xcode.');
    process.exit(2);
  }
  run('xcrun', ['xctrace', 'list', 'devices']);
  console.log('IOS DEVICE GATE: PASS — Xcode device inventory completed.');
  process.exit(0);
}
console.error(`Unknown device gate: ${mode}`);
process.exit(2);
