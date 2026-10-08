'use strict';

// HTTP access to the real backend.
//
// Reuses scripts/zero-cost/http.cjs (cookie + bearer handling) and adds masked
// request/response artifacts. Also owns the API target: an operator-given
// E2E_API_URL, or a local `node backend/server.js` started by this suite.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { Client } = require('../../../scripts/zero-cost/http.cjs');
const config = require('./config.cjs');
const guard = require('./guard.cjs');
const { writeArtifact } = require('./reporter.cjs');

let sequence = 0;

/** Client that records every exchange (masked) under the layer's artifact folder. */
class E2EClient extends Client {
  constructor(baseUrl, { layer = 'api', label = 'client' } = {}) {
    guard.assertNotProduction(baseUrl, 'API');
    super(baseUrl);
    this.layer = layer;
    this.label = label;
  }

  async req(method, route, body, opts) {
    const response = await super.req(method, route, body, opts);
    sequence += 1;
    writeArtifact(this.layer, `${String(sequence).padStart(3, '0')}-${this.label}-${method}-${route}.json`, {
      request: { method, route, body },
      response: { status: response.status, ms: Math.round(response.ms), data: response.data }
    });
    return response;
  }

  async loginWorker(workerCode) {
    return this.req('POST', '/api/auth/login', { username: workerCode, access_type: 'worker' });
  }

  async loginManager(username, password) {
    return this.req('POST', '/api/auth/login', { username, password, access_type: 'management' });
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs) {
  const until = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < until) {
    try {
      const response = await fetch(url);
      if (response.status < 500 || response.status === 503) return response.status;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`backend did not answer ${url}: ${lastError?.message || 'timeout'}`);
}

async function waitReady(baseUrl, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const response = await fetch(`${baseUrl}/api/health/ready`);
      if (response.status === 200) return true;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

/**
 * Start backend/server.js on a free port.
 *
 * With a guarded E2E DB the backend connects to it. Without one it gets an
 * unreachable DB (127.0.0.1:1) so only DB-independent behaviour is exercised.
 * The process runs from an empty working directory so no backend/.env can
 * inject other database credentials.
 */
async function startLocalBackend({ db = null, layer = 'api', corsOrigins = [] } = {}) {
  const port = await freePort();
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ktc-e2e-backend-'));
  const logFile = path.join(config.layerDir(layer), `backend-${db ? 'e2e-db' : 'no-db'}.log`);
  const log = fs.createWriteStream(logFile);
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    PORT: String(port),
    JWT_SECRET: crypto.randomBytes(32).toString('hex'),
    STARTUP_FAILURE_EXIT_MS: '3600000',
    CORS_ORIGINS: ['http://127.0.0.1:5173', 'http://localhost:5173', ...corsOrigins].join(','),
    // The DB layer reads the GC company workbook back through the API.
    ENABLE_SERVER_COMPANY_EXCEL: 'true',
    ...(db
      ? { DB_HOST: db.host, DB_PORT: String(db.port), DB_USER: db.user, DB_PASSWORD: db.password, DB_NAME: db.database, DB_SSL: db.ssl ? 'true' : 'false' }
      : { DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'ktc_e2e_none', DB_PASSWORD: 'none', DB_NAME: 'ktc_e2e_no_database', DB_SSL: 'false' })
  };
  const child = spawn(process.execPath, [path.join(config.ROOT, 'backend', 'server.js')], { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (chunk) => log.write(require('./reporter.cjs').maskString(chunk)));
  child.stderr.on('data', (chunk) => log.write(require('./reporter.cjs').maskString(chunk)));
  const baseUrl = `http://127.0.0.1:${port}`;
  const exited = () => child.exitCode != null || child.signalCode != null;
  const waitExit = (ms) => new Promise((resolve) => {
    if (exited()) return resolve();
    const timer = setTimeout(resolve, ms);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  const stop = async () => {
    if (!exited()) {
      child.kill('SIGTERM');
      await waitExit(3000);
      if (!exited()) { child.kill('SIGKILL'); await waitExit(2000); }
    }
    child.stdout.destroy();
    child.stderr.destroy();
    log.end();
    fs.rmSync(cwd, { recursive: true, force: true });
  };
  try {
    await waitFor(`${baseUrl}/api/health/live`, 20_000);
    if (db && !(await waitReady(baseUrl, 60_000))) throw new Error(`local backend never became ready on the E2E DB (see ${logFile})`);
  } catch (error) {
    await stop();
    throw error;
  }
  return { baseUrl, mode: db ? 'local-e2e-db' : 'local-no-db', logFile, stop };
}

/**
 * API target for this run. E2E_API_URL wins (mode "remote"); otherwise a local
 * backend on the guarded E2E DB, or on no DB at all.
 */
async function resolveApiTarget({ layer = 'api', corsOrigins = [] } = {}) {
  const configured = config.configuredApiUrl();
  if (configured) {
    guard.assertNotProduction(configured, 'E2E_API_URL');
    return { baseUrl: configured, mode: process.env.E2E_INTERNAL_API_MODE || 'remote', stop: async () => {} };
  }
  const db = await guard.checkDatabase();
  return startLocalBackend({ db: db.ok ? db.config : null, layer, corsOrigins });
}

/** True when the target's backend has a database behind it (for DB-backed reads). */
function hasDatabase(target) {
  return target?.mode === 'local-e2e-db' || String(process.env.E2E_API_DB_NAME || '').trim() === config.EXPECTED_DB_NAME;
}

module.exports = { E2EClient, startLocalBackend, resolveApiTarget, hasDatabase };
