#!/usr/bin/env node
'use strict';

// E2E entry point.
//
//   node test/e2e/full.cjs                 all layers, in order
//   node test/e2e/full.cjs --layer excel   one layer (web | api | db | excel | desktop)
//
// Layers run one after another. A layer whose environment is missing (no E2E
// DB, no Windows, no Electron, no browser) SKIPs with a reason; only FAIL makes
// the exit code non-zero. SKIP is never counted as PASS.

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');
const config = require('./lib/config.cjs');
const reporter = require('./lib/reporter.cjs');
const guard = require('./lib/guard.cjs');

const ORDER = ['excel', 'desktop', 'api', 'db', 'web'];
const FRONTEND = path.join(config.ROOT, 'frontend');
// node --test imports a custom reporter through the ESM loader, which rejects raw
// Windows paths ("E:\\...", protocol 'e:'); it needs a file:// URL on every platform.
const REPORTER = pathToFileURL(path.join(__dirname, 'lib', 'reporter.cjs')).href;

const testFiles = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.test.cjs')).sort().map((f) => path.join(dir, f));

function run(command, args, { env = {}, cwd = config.ROOT } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
    child.on('error', (error) => resolve({ code: 1, error }));
    child.on('exit', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0) }));
  });
}

function runNodeTests(layer, files, env = {}) {
  return run(process.execPath, ['--test', '--test-concurrency=1', `--test-reporter=${REPORTER}`, '--test-reporter-destination=stdout', ...files], {
    env: { E2E_LAYER: layer, ...env }
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)); });
  });
}

async function waitHttp(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try { if ((await fetch(url)).status < 500) return true; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/** Vite dev server for the web layer, pointed at the given API. */
async function startVite(apiBaseUrl, port) {
  const vite = path.join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(vite)) return { ok: false, reason: 'frontend/node_modules missing (run npm ci in frontend)' };
  const log = fs.createWriteStream(path.join(config.layerDir('web'), 'vite.log'));
  const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: FRONTEND,
    env: { ...process.env, VITE_API_URL: `${apiBaseUrl}/api`, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  const url = `http://127.0.0.1:${port}`;
  const stop = async () => { if (child.exitCode == null) { child.kill('SIGTERM'); await new Promise((r) => { child.once('exit', r); setTimeout(r, 3000); }); } };
  if (!(await waitHttp(`${url}/login`, 90_000))) {
    await stop();
    return { ok: false, reason: 'Vite dev server did not start (see test-results/e2e-results/web/vite.log)' };
  }
  return { ok: true, url, stop };
}

function chromiumReason() {
  const browsers = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (process.env.E2E_CHROMIUM_PATH && fs.existsSync(process.env.E2E_CHROMIUM_PATH)) return '';
  if (browsers && fs.existsSync(browsers) && fs.readdirSync(browsers).some((d) => d.startsWith('chromium'))) return '';
  const home = path.join(require('node:os').homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(home) && fs.readdirSync(home).some((d) => d.startsWith('chromium'))) return '';
  return 'Chromium for Playwright not installed (npx playwright install chromium, or set E2E_CHROMIUM_PATH)';
}

const LAYER_RUNNERS = {
  excel: () => runNodeTests('excel', testFiles(path.join(__dirname, 'excel'))),

  // Existing desktop node:test suites run here too, so the layer reuses them.
  desktop: () => runNodeTests('desktop', [
    ...testFiles(path.join(__dirname, 'desktop')),
    ...testFiles(path.join(config.ROOT, 'desktop', 'tests'))
  ]),

  async api() {
    const { resolveApiTarget } = require('./lib/api-client.cjs');
    const target = await resolveApiTarget({ layer: 'api' });
    console.log(`[E2E] API target: ${target.baseUrl} (${target.mode})`);
    try {
      return await runNodeTests('api', testFiles(path.join(__dirname, 'api')), { E2E_API_URL: target.baseUrl, E2E_INTERNAL_API_MODE: target.mode });
    } finally { await target.stop(); }
  },

  async db() {
    const verdict = await guard.checkDatabase();
    if (!verdict.ok) {
      console.log(`[E2E] DB layer: ${verdict.reason} — tests will SKIP`);
      return runNodeTests('db', testFiles(path.join(__dirname, 'db')));
    }
    const { resolveApiTarget } = require('./lib/api-client.cjs');
    const target = await resolveApiTarget({ layer: 'db' });
    console.log(`[E2E] DB layer: API ${target.baseUrl} (${target.mode}) on ${verdict.config.database}`);
    try {
      return await runNodeTests('db', testFiles(path.join(__dirname, 'db')), { E2E_API_URL: target.baseUrl, E2E_INTERNAL_API_MODE: target.mode });
    } finally { await target.stop(); }
  },

  async web() {
    const cli = path.join(FRONTEND, 'node_modules', '@playwright', 'test', 'cli.js');
    if (!fs.existsSync(cli)) {
      reporter.writeSummary('web', [{ layer: 'web', name: 'Playwright', status: 'SKIP', reason: '@playwright/test not installed in frontend (npm ci in frontend)' }]);
      return { code: 0 };
    }
    const browserReason = chromiumReason();
    if (browserReason) {
      reporter.writeSummary('web', [{ layer: 'web', name: 'Playwright', status: 'SKIP', reason: browserReason }]);
      return { code: 0 };
    }
    const env = { NODE_PATH: path.join(FRONTEND, 'node_modules') };
    const stops = [];
    try {
      let frontendUrl = config.configuredFrontendUrl();
      if (frontendUrl) {
        guard.assertNotProduction(frontendUrl, 'E2E_FRONTEND_URL');
        const apiUrl = config.configuredApiUrl();
        if (apiUrl) Object.assign(env, { E2E_API_URL: apiUrl });
      } else {
        const vitePort = await freePort();
        const { resolveApiTarget } = require('./lib/api-client.cjs');
        const target = await resolveApiTarget({ layer: 'web', corsOrigins: [`http://127.0.0.1:${vitePort}`] });
        stops.push(target.stop);
        Object.assign(env, { E2E_API_URL: target.baseUrl, E2E_INTERNAL_API_MODE: target.mode });
        const vite = await startVite(target.baseUrl, vitePort);
        if (vite.ok) { stops.push(vite.stop); frontendUrl = vite.url; } else env.E2E_WEB_UNAVAILABLE = vite.reason;
        console.log(`[E2E] Web: frontend ${frontendUrl || 'unavailable'}; API ${target.baseUrl} (${target.mode})`);
      }
      if (frontendUrl) env.E2E_FRONTEND_URL = frontendUrl;
      return await run(process.execPath, [cli, 'test', '--config', path.join(__dirname, 'web', 'playwright.config.cjs')], { env });
    } finally {
      for (const stop of stops.reverse()) await stop();
    }
  }
};

async function runLayer(layer) {
  reporter.clearSummary(layer);
  fs.rmSync(path.join(config.ARTIFACT_ROOT, layer), { recursive: true, force: true });
  console.log(`\n=== ${config.LAYERS[layer].category} · ${config.LAYERS[layer].title} ===`);
  let outcome;
  try {
    outcome = await LAYER_RUNNERS[layer]();
  } catch (error) {
    outcome = { code: 1, error };
  }
  let summary = reporter.readSummary(layer);
  if (!summary) {
    summary = reporter.writeSummary(layer, [{
      layer, name: `${layer} layer runner`, status: 'FAIL',
      error: outcome?.error ? reporter.maskString(outcome.error.stack || outcome.error.message) : `runner exited ${outcome?.code} without results`
    }]);
  } else if (outcome?.error) {
    summary.results.push({ layer, name: `${layer} layer runner`, status: 'FAIL', error: reporter.maskString(outcome.error.message) });
    summary = reporter.writeSummary(layer, summary.results);
  }
  return summary;
}

function printReport(summaries) {
  const all = summaries.flatMap((s) => s.results);
  const lines = ['', '==================== E2E REPORT ===================='];
  for (const item of all.filter((r) => r.status !== 'PASS')) lines.push(reporter.formatResult(item));
  const totals = reporter.count(all);
  lines.push('', reporter.formatCounts(totals), '');
  lines.push('LAYER     PASS  FAIL  SKIP');
  for (const category of ['FE', 'BE', 'DB', 'EXCEL', 'DESKTOP']) {
    const items = summaries.filter((s) => s.category === category).flatMap((s) => s.results);
    if (!items.length && !summaries.some((s) => s.category === category)) continue;
    const c = reporter.count(items);
    lines.push(`${category.padEnd(9)} ${String(c.PASS).padStart(4)}  ${String(c.FAIL).padStart(4)}  ${String(c.SKIP).padStart(4)}`);
  }
  lines.push(`Artifacts: ${path.relative(config.ROOT, config.ARTIFACT_ROOT)}/`);
  const text = lines.join('\n');
  console.log(text);
  fs.writeFileSync(path.join(config.ARTIFACT_ROOT, 'report.txt'), `${text}\n`);
  fs.writeFileSync(path.join(config.ARTIFACT_ROOT, 'report.json'), JSON.stringify({ totals, layers: summaries }, null, 2));
  return totals;
}

async function main() {
  const index = process.argv.indexOf('--layer');
  const requested = index > -1 ? process.argv[index + 1] : null;
  if (requested && !ORDER.includes(requested)) {
    console.error(`Unknown layer ${requested}; expected one of ${ORDER.join(', ')}`);
    process.exit(2);
  }
  fs.mkdirSync(config.ARTIFACT_ROOT, { recursive: true });
  const summaries = [];
  for (const layer of requested ? [requested] : ORDER) summaries.push(await runLayer(layer));
  const totals = printReport(summaries);
  process.exitCode = totals.FAIL > 0 ? 1 : 0;
}

main().catch((error) => {
  console.error('E2E runner crashed:', reporter.maskString(error.stack || error.message));
  process.exit(1);
});
