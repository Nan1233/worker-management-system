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
  assert.doesNotMatch(source, /CREATE TABLE|ensureTable/, 'telemetry handlers must never run schema DDL');
  assert.match(source, /INSERT INTO ktc_desktop_startup_diagnostics/);
  assert.match(source, /const POINTS =/);
  assert.match(source, /const installId = String\(payload\.installId/);
  assert.doesNotMatch(source, /process\.env|hostname\(|userAgent|req\.headers|authorization/i);
});

test('Electron captures app/window events without reading report data', () => {
  const launcher = read('../desktop/electron/launcher.cjs');
  const main = read('../desktop/electron/main.cjs');
  const preload = read('../desktop/electron/preload.cjs');
  assert.match(launcher, /__KTC_STARTUP_DIAGNOSTICS__/);
  assert.match(main, /window_ready_to_show/);
  assert.match(main, /frontend_loaded/);
  assert.match(main, /frontend_painted/);
  assert.match(main, /ktc-startup-diagnostics/);
  assert.match(preload, /getStartupDiagnostics/);
});

test('anonymous startup telemetry needs no login and is strictly rate-limited', () => {
  const routes = read('routes/systemRoutes.js');
  assert.match(routes, /router\.post\('\/desktop-startup\/anonymous', anonymousStartupLimiter/);
  assert.match(routes, /windowMs:\s*60 \* 60 \* 1000/);
  assert.match(routes, /limit:\s*12/);
  assert.match(routes, /keyGenerator:\s*\(req\) => `startup:\$\{hashKey\(safeClientIp\(req\), 'startup-ip'\)\}`/);
  assert.match(routes, /startupDiag\.submit\(0, req\.body\)/);
});

test('renderer only loads and sends telemetry after frontend load and first paints', () => {
  const service = read('../frontend/src/services/desktopStartupTelemetry.ts');
  const frontend = read('../frontend/src/main.tsx');
  const auth = read('../frontend/src/components/AuthBootstrap.tsx');
  assert.match(service, /credentials:\s*"omit"/);
  assert.match(service, /desktop-startup\/anonymous/);
  assert.doesNotMatch(service, /getAccessToken|from "\.\/api"|setInterval/);
  assert.match(frontend, /window\.addEventListener\("load", afterPaint/);
  assert.match(frontend, /window\.requestAnimationFrame/);
  assert.match(frontend, /markFrontendPaint/);
  assert.match(frontend, /import\("\.\/services\/desktopStartupTelemetry"\)/);
  assert.doesNotMatch(auth, /startDesktopStartupTelemetry/);
});
