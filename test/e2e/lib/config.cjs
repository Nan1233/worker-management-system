'use strict';

// Single place that decides what the E2E suite may touch.
//
// Every layer asks this module whether its environment exists. When it does
// not, the layer SKIPs with the reason returned here. Nothing in the suite may
// fall back to a production database or a production API.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const E2E_DIR = path.resolve(__dirname, '..');
const ARTIFACT_ROOT = path.resolve(process.env.E2E_ARTIFACT_DIR || path.join(ROOT, 'test-results', 'e2e-results'));

const EXPECTED_DB_NAME = 'worker_management_e2e';
// scripts/zero-cost/seed-ci.cjs prepares this one; it is only accepted on a local host.
const LOCAL_STAGING_DB_NAME = 'worker_management_staging_local';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

// Hosts that serve real factory data. A run pointed at them is refused outright.
const PRODUCTION_HOST_PATTERNS = [
  /worker-management-system-3-dzox\.onrender\.com/i,
  /(^|\.)ktc-be(?!-test)[\w-]*\.[\w.-]+/i,
  /(^|\.)ktc-fe(?!-test)[\w-]*\.[\w.-]+/i
];

const LAYERS = Object.freeze({
  web: { category: 'FE', title: 'Web (Playwright)' },
  api: { category: 'BE', title: 'API' },
  db: { category: 'DB', title: 'FE/API -> BE -> DB' },
  excel: { category: 'EXCEL', title: 'Excel' },
  desktop: { category: 'DESKTOP', title: 'Desktop (Node only)' }
});

const env = (key) => String(process.env[key] ?? '').trim();

function layerDir(layer) {
  const dir = path.join(ARTIFACT_ROOT, layer);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function looksLikeProduction(url) {
  const value = String(url || '');
  return PRODUCTION_HOST_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Database the DB / write tests may use. Returns { ok, reason, config }.
 * This is a static check; lib/guard.cjs also confirms the live connection.
 */
function dbTarget() {
  const name = env('DB_NAME');
  const host = env('DB_HOST');
  const missing = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'].filter((key) => !env(key));
  if (!name) return { ok: false, reason: `DB_NAME=${EXPECTED_DB_NAME} unavailable` };
  const isE2e = name === EXPECTED_DB_NAME;
  const isLocalStaging = name === LOCAL_STAGING_DB_NAME && LOCAL_HOSTS.has(host) && env('KTC_RUNTIME_ENV_CLASS') === 'STAGING';
  if (!isE2e && !isLocalStaging) {
    return { ok: false, reason: `DB_NAME=${name} is not an E2E database (expected ${EXPECTED_DB_NAME}); refusing to touch it` };
  }
  if (missing.length) return { ok: false, reason: `DB_NAME=${name} set but missing ${missing.join(', ')}` };
  return {
    ok: true,
    reason: '',
    config: {
      host,
      port: Number(env('DB_PORT') || 3306),
      user: env('DB_USER'),
      password: process.env.DB_PASSWORD,
      database: name,
      ssl: LOCAL_HOSTS.has(host) || env('DB_SSL') === 'false' ? undefined : { rejectUnauthorized: true }
    }
  };
}

/** API base URL given by the operator, or null when the suite should start a local backend. */
function configuredApiUrl() {
  const url = env('E2E_API_URL') || env('KTC_E2E_API_URL');
  return url ? url.replace(/\/+$/, '').replace(/\/api$/i, '') : null;
}

function configuredFrontendUrl() {
  const url = env('E2E_FRONTEND_URL') || env('KTC_FRONTEND_URL');
  return url ? url.replace(/\/+$/, '') : null;
}

/**
 * Accounts and master data used by write tests. Same fixture format as
 * scripts/zero-cost/seed-ci.cjs; env vars override individual values.
 */
function fixture() {
  const file = path.resolve(env('E2E_FIXTURE') || env('KTC_ZERO_COST_FIXTURE') || path.join(ROOT, 'validation-artifacts', 'fixture.json'));
  let data = {};
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { data = {}; }
  }
  const gc = data.processes?.GC || {};
  const machines = (env('E2E_GC_MACHINES') ? env('E2E_GC_MACHINES').split(',') : (gc.machines || []).map((m) => m.code)).map((x) => String(x).trim()).filter(Boolean);
  const result = {
    file: fs.existsSync(file) ? file : null,
    workerCode: env('E2E_WORKER_CODE') || env('KTC_E2E_WORKER_CODE') || data.worker?.code || '',
    managerUsername: env('E2E_MANAGER_USERNAME') || env('KTC_E2E_MANAGER_USERNAME') || data.manager?.username || '',
    managerPassword: env('E2E_MANAGER_PASSWORD') || env('KTC_E2E_MANAGER_PASSWORD') || data.manager?.password || '',
    gcProcessId: Number(env('E2E_GC_PROCESS_ID') || gc.id || 1),
    gcProduct: env('E2E_GC_PRODUCT') || gc.product || '',
    gcMachines: machines
  };
  const missing = [];
  if (!result.workerCode) missing.push('E2E_WORKER_CODE');
  if (!result.managerUsername) missing.push('E2E_MANAGER_USERNAME');
  if (!result.managerPassword) missing.push('E2E_MANAGER_PASSWORD');
  if (!result.gcProduct) missing.push('E2E_GC_PRODUCT');
  if (result.gcMachines.length < 2) missing.push('E2E_GC_MACHINES (2 GC machine codes)');
  result.ok = missing.length === 0;
  result.reason = result.ok ? '' : `E2E fixture incomplete: set ${missing.join(', ')} or KTC_ZERO_COST_FIXTURE`;
  return result;
}

function isWindows() {
  return process.platform === 'win32';
}

module.exports = {
  ROOT,
  E2E_DIR,
  ARTIFACT_ROOT,
  EXPECTED_DB_NAME,
  LAYERS,
  layerDir,
  looksLikeProduction,
  dbTarget,
  configuredApiUrl,
  configuredFrontendUrl,
  fixture,
  isWindows
};
