'use strict';

// Real-database HTTP integration harness.
//
// It builds a throw-away database from the repository's own SQL
// (canonical snapshot + migrations 026+), boots the real Express app on an
// ephemeral port and drives it with fetch(). Nothing is mocked.
//
// Enable with:
//   KTC_IT_DB_HOST=127.0.0.1 KTC_IT_DB_PORT=3306 KTC_IT_DB_USER=... \
//   KTC_IT_DB_PASSWORD=... KTC_IT_DB_NAME=ktc_it_main npm run test:integration
//
// Safety: KTC_IT_DB_NAME must start with "ktc_it_". Every table in it is DROPPED and
// rebuilt on each run, so never point it at a real database.

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const env = process.env;
const BACKEND_DIR = path.resolve(__dirname, '..', '..');
const TEST_DB = String(env.KTC_IT_DB_NAME || '').trim();
const enabled = Boolean(env.KTC_IT_DB_HOST && env.KTC_IT_DB_USER && /^ktc_it_[A-Za-z0-9_]+$/.test(TEST_DB));
const skipReason = enabled
  ? false
  : 'Set KTC_IT_DB_HOST/KTC_IT_DB_USER/KTC_IT_DB_PASSWORD and KTC_IT_DB_NAME=ktc_it_* to run real-DB integration tests';

if (enabled) {
  // The app reads its configuration at require() time, so set it first.
  env.DB_HOST = env.KTC_IT_DB_HOST;
  env.DB_PORT = env.KTC_IT_DB_PORT || '3306';
  env.DB_USER = env.KTC_IT_DB_USER;
  env.DB_PASSWORD = env.KTC_IT_DB_PASSWORD || '';
  env.DB_NAME = TEST_DB;
  env.DB_SSL = 'false';
  env.NODE_ENV = 'test';
  env.PORT = '0';
  env.JWT_SECRET = env.JWT_SECRET || 'integration-test-secret-integration-test-secret';
  env.STARTUP_FAILURE_EXIT_MS = '3600000';
  env.API_RATE_LIMIT = '100000';
  env.LOGIN_ACCOUNT_RATE_LIMIT = '100000';
  env.LOGIN_NETWORK_RATE_LIMIT = '100000';
  env.WORKER_REPORT_RATE_LIMIT = '100000';
}

const migrationNumber = (file) => Number(String(file).split('_')[0]);

async function buildDatabase() {
  const mysql = require('mysql2/promise');
  const connection = await mysql.createConnection({
    host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, multipleStatements: true
  });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    await connection.query(`USE \`${TEST_DB}\``);
    // Drop tables instead of the database so a restricted DB user is enough.
    const [existing] = await connection.query('SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?', [TEST_DB]);
    if (existing.length) {
      await connection.query('SET FOREIGN_KEY_CHECKS=0');
      for (const row of existing) await connection.query(`DROP TABLE IF EXISTS \`${row.name}\``);
      await connection.query('SET FOREIGN_KEY_CHECKS=1');
    }

    const canonical = fs.readFileSync(path.join(BACKEND_DIR, 'database', 'KTC_FULL_DATABASE_CANONICAL_20260817.sql'), 'utf8')
      .replace(/^DROP DATABASE IF EXISTS worker_management;\s*$/m, '')
      .replace(/^CREATE DATABASE worker_management CHARACTER SET utf8mb4;\s*$/m, '')
      .replace(/^USE worker_management;\s*$/m, '');
    await connection.query(canonical);

    const migrations = fs.readdirSync(path.join(BACKEND_DIR, 'migrations'))
      .filter((file) => /^\d{3}_.*\.sql$/.test(file) && migrationNumber(file) >= 26)
      .sort();
    for (const file of migrations) {
      await connection.query(fs.readFileSync(path.join(BACKEND_DIR, 'migrations', file), 'utf8'));
    }

    // KNOWN SCHEMA GAPS (see report): application code uses columns that no SQL file in
    // this repository creates (the live database has them from earlier rebuilds). Until a
    // reviewed migration exists the harness adds them so the real code paths can run.
    // product_standards.encoding_code is selected by every report submission.
    await connection.query('ALTER TABLE product_standards ADD COLUMN IF NOT EXISTS encoding_code VARCHAR(180) NULL');
    // Same gap: approved-report edits run "UPDATE production_reports SET updated_by=?" but
    // only production_reports_temp.updated_by is created by a migration (029).
    await connection.query('ALTER TABLE production_reports ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL');

    // Keep master data (processes, machines, products, deduction/defect types);
    // drop every person, session and report so each test starts deterministic.
    for (const table of [
      'users', 'workers', 'worker_processes', 'manager_processes', 'user_sessions',
      'user_permission_overrides', 'role_permission_overrides', 'activity_logs', 'notifications',
      'production_reports_temp', 'production_temp_deductions', 'production_temp_defects',
      'production_temp_machine_lines', 'production_temp_machine_defects',
      'production_reports', 'production_report_deductions', 'production_report_defects',
      'production_report_machine_lines', 'production_report_machine_defects', 'production_report_snapshots',
      'production_report_duplicate_locks', 'report_action_logs', 'report_edit_logs', 'report_versions',
      'report_edit_proposals', 'machine_production_events', 'machine_production_event_defects'
    ]) {
      await connection.query(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await connection.end();
  }
}

let server = null;
let baseUrl = '';
let dbModule = null;

async function start({ port = 0, host = '127.0.0.1' } = {}) {
  await buildDatabase();
  const app = require(path.join(BACKEND_DIR, 'server.js')).app;
  dbModule = require(path.join(BACKEND_DIR, 'config', 'db'));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(port, host, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return { baseUrl, db: dbModule.promise() };
}

async function stop() {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  // server.js starts its own listener, keep-alive timer and schedulers on
  // require(); the test process is short-lived so exit explicitly.
  setTimeout(() => process.exit(process.exitCode || 0), 200).unref();
}

async function request(method, url, { token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: response.status, body: json, headers: response.headers };
}

// ── fixtures ────────────────────────────────────────────────────────────────

async function createUser(db, { username, fullName, role, password = 'Passw0rd!x', workerCode = null, processCodes = [], trainingPercent = 100 }) {
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(role === 'worker' ? crypto_random() : password, 4);
  const [userResult] = await db.query(
    'INSERT INTO users (username,password,full_name,role,status) VALUES (?,?,?,?,\'active\')',
    [username, hash, fullName || username, role]
  );
  const userId = userResult.insertId;
  let workerId = null;
  if (role === 'worker') {
    const [workerResult] = await db.query(
      'INSERT INTO workers (user_id,worker_code,training_percent,status) VALUES (?,?,?,\'active\')',
      [userId, workerCode || username, trainingPercent]
    );
    workerId = workerResult.insertId;
  }
  for (const code of processCodes) {
    const [[processRow]] = await db.query('SELECT id FROM processes WHERE process_code=?', [code]);
    if (role === 'worker') await db.query('INSERT INTO worker_processes (worker_id,process_id) VALUES (?,?)', [workerId, processRow.id]);
    else await db.query('INSERT INTO manager_processes (manager_id,process_id) VALUES (?,?)', [userId, processRow.id]);
  }
  return { userId, workerId, username, password, workerCode: workerCode || username, role };
}

function crypto_random() {
  return require('node:crypto').randomBytes(24).toString('hex');
}

async function loginWorker(workerCode) {
  const res = await request('POST', '/api/auth/login', { body: { username: workerCode, access_type: 'worker' } });
  return { ...res, token: res.body?.token || res.body?.accessToken };
}

async function loginManagement(username, password) {
  const res = await request('POST', '/api/auth/login', { body: { username, password, access_type: 'management' } });
  return { ...res, token: res.body?.token || res.body?.accessToken };
}

// ── report fixtures ─────────────────────────────────────────────────────────

/** YYYY-MM-DD in Vietnam time, shifted by `offsetDays` (default: yesterday). */
function vnDate(offsetDays = -1) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.now() + offsetDays * 86400000));
  const v = Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return `${v.year}-${v.month}-${v.day}`;
}

let requestCounter = 0;

/**
 * A valid manual (no machine) report for a no-machine process such as XLBV,
 * built from real master data in the database.
 */
async function manualReportBody(db, { processCode = 'XLBV', workDate = vnDate(-1), shift = 'A', ok = 100, ng = 0, actualHours = 7, deductionHours = 1, clientRequestId = null, productIndex = 0, productCode = null, standardOutput = null } = {}) {
  const [[proc]] = await db.query('SELECT id FROM processes WHERE process_code=?', [processCode]);
  const [products] = await db.query("SELECT product_code, standard_output FROM product_standards WHERE process_id=? AND status='active' ORDER BY id LIMIT 5", [proc.id]);
  const product = productCode ? { product_code: productCode, standard_output: standardOutput } : products[productIndex];
  const [[deduction]] = await db.query("SELECT id FROM deduction_types WHERE process_id=? AND status='active' ORDER BY id LIMIT 1", [proc.id]);
  requestCounter += 1;
  return {
    process_id: proc.id,
    work_date: workDate,
    shift,
    operation_mode: 'MANUAL',
    product_name: product.product_code,
    total_time: actualHours + deductionHours,
    actual_time: actualHours,
    deduction_time: deductionHours,
    standard_output: Number(standardOutput ?? product.standard_output),
    tt_ok: ok,
    tt_ng: ng,
    actual_output: ok + ng,
    defects: [],
    deductions: deductionHours > 0 ? [{ deduction_type_id: deduction.id, hours: deductionHours }] : [],
    client_request_id: clientRequestId || `it-${process.pid}-${Date.now()}-${requestCounter}`
  };
}

async function submitReport(token, body) {
  return request('POST', '/api/production-temp', { token, body });
}

module.exports = { enabled, skipReason, start, stop, request, createUser, loginWorker, loginManagement, vnDate, manualReportBody, submitReport };
