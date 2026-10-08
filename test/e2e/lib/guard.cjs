'use strict';

// Safety gate in front of everything that writes or reads real data.
//
// The canonical DB check stays in backend/scripts/e2e-db-guard.cjs (it refuses any
// DB_NAME other than worker_management_e2e and confirms SELECT DATABASE() on the
// live connection). This module runs that script instead of re-implementing it,
// and adds the API-side rules the script cannot know about.

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const config = require('./config.cjs');

const BACKEND_DIR = path.join(config.ROOT, 'backend');
let cached = null;

function runCanonicalGuard() {
  const result = spawnSync(process.execPath, [path.join(BACKEND_DIR, 'scripts', 'e2e-db-guard.cjs')], {
    cwd: BACKEND_DIR,
    env: process.env,
    encoding: 'utf8',
    timeout: 30_000
  });
  if (result.error) return { ok: false, reason: `e2e-db-guard could not run: ${result.error.message}` };
  if (result.status !== 0) {
    const line = String(result.stderr || result.stdout || '').trim().split('\n').pop() || `exit ${result.status}`;
    return { ok: false, reason: line.replace(/^E2E REFUSED:\s*/, 'e2e-db-guard refused: ') };
  }
  return { ok: true, reason: '' };
}

async function checkLocalStaging(dbConfig) {
  let mysql;
  try { mysql = require(path.join(BACKEND_DIR, 'node_modules', 'mysql2', 'promise')); } catch {
    return { ok: false, reason: 'backend/node_modules/mysql2 missing (run npm install in backend)' };
  }
  try {
    const connection = await mysql.createConnection({ ...dbConfig, connectTimeout: 8000 });
    try {
      const [rows] = await connection.query('SELECT DATABASE() AS name');
      const name = String(rows?.[0]?.name || '');
      return name === dbConfig.database ? { ok: true, reason: '' } : { ok: false, reason: `connected database mismatch: ${name || '<empty>'}` };
    } finally {
      await connection.end();
    }
  } catch (error) {
    return { ok: false, reason: `local staging DB unreachable: ${error.code || error.message}` };
  }
}

/** { ok, reason, config } — ok only for a reachable, verified E2E database. */
async function checkDatabase() {
  if (cached) return cached;
  const target = config.dbTarget();
  if (!target.ok) {
    cached = { ok: false, reason: target.reason };
    return cached;
  }
  const verdict = target.config.database === config.EXPECTED_DB_NAME
    ? runCanonicalGuard()
    : await checkLocalStaging(target.config);
  cached = verdict.ok ? { ok: true, reason: '', config: target.config } : { ok: false, reason: verdict.reason };
  return cached;
}

/** Throws when a URL points at a known production host. */
function assertNotProduction(url, label = 'URL') {
  if (config.looksLikeProduction(url)) {
    throw new Error(`E2E REFUSED: ${label} ${url} is a production host`);
  }
}

/**
 * Write tests may only go through an API whose database is known to be the E2E DB:
 * the local backend this suite starts against the guarded DB, or a remote API the
 * operator explicitly confirms with E2E_API_DB_NAME=worker_management_e2e.
 */
function apiWriteAllowed(apiTarget) {
  if (!apiTarget) return { ok: false, reason: 'no API target' };
  if (config.looksLikeProduction(apiTarget.baseUrl)) return { ok: false, reason: `API ${apiTarget.baseUrl} is production; writes refused` };
  if (apiTarget.mode === 'local-e2e-db') return { ok: true, reason: '' };
  if (apiTarget.mode === 'local-no-db') return { ok: false, reason: 'local backend has no E2E database' };
  if (String(process.env.E2E_API_DB_NAME || '').trim() === config.EXPECTED_DB_NAME) return { ok: true, reason: '' };
  return { ok: false, reason: `remote API ${apiTarget.baseUrl}: set E2E_API_DB_NAME=${config.EXPECTED_DB_NAME} to confirm it uses the E2E database` };
}

module.exports = { checkDatabase, assertNotProduction, apiWriteAllowed };
