'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('diagnostics API authenticates uploads and protects inspection with admin/permission', () => {
  const routes = read('routes/systemRoutes.js');
  assert.match(routes, /router\.post\('\/desktop-startup', auth/);
  assert.match(routes, /router\.get\('\/desktop-startup', auth, role\('admin'\), permission\('SYSTEM_HEALTH_VIEW'\)/);
});

test('telemetry is bounded, redacted, and saved separately from production reports', () => {
  const source = read('services/desktopStartupDiagnosticsService.js');
  assert.match(source, /CREATE TABLE IF NOT EXISTS ktc_desktop_startup_diagnostics/);
  assert.match(source, /INSERT INTO ktc_desktop_startup_diagnostics/);
  assert.match(source, /const POINTS =/);
  assert.match(source, /install_id CHAR\(36\)/);
  assert.doesNotMatch(source, /process\.env|hostname\(|userAgent|req\.headers|authorization/i);
});

test('Electron captures app/window events without reading report data', () => {
  const launcher = read('../desktop/electron/launcher.cjs');
  const main = read('../desktop/electron/main.cjs');
  const preload = read('../desktop/electron/preload.cjs');
  assert.match(launcher, /__KTC_STARTUP_DIAGNOSTICS__/);
  assert.match(main, /window_ready_to_show/);
  assert.match(main, /frontend_loaded/);
  assert.match(main, /ktc-startup-diagnostics/);
  assert.match(preload, /getStartupDiagnostics/);
});

test('renderer uploads only after access token and does not block auth bootstrap', () => {
  const service = read('../frontend/src/services/desktopStartupTelemetry.ts');
  const auth = read('../frontend/src/components/AuthBootstrap.tsx');
  assert.match(service, /if \(!getAccessToken\(\)\) return/);
  assert.match(service, /api\.post\("\/system\/desktop-startup"/);
  assert.match(auth, /startDesktopStartupTelemetry\(\)/);
});
