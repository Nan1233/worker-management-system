const db = require('../config/db');
const crypto = require('node:crypto');

const query = (sql, params = []) => db.promise().query(sql, params).then(([rows]) => rows);
async function ensureTable() {
  // excel_export_jobs is owned by canonical migration 004/reset schema.
  // Runtime request/startup paths must never CREATE/ALTER schema.
}

function normalize(row) {
  if (!row) return null;
  const parse = (value) => {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    try { return JSON.parse(value); } catch { return null; }
  };
  return {
    id: row.id,
    type: row.job_type,
    payload: parse(row.payload_json) || {},
    status: row.status,
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || 0),
    result: parse(row.result_json),
    metrics: parse(row.metrics_json),
    error: row.error_message || null,
    requestedBy: row.requested_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    nextAttemptAt: row.next_attempt_at
  };
}

async function create({ type, payload, requestedBy, maxAttempts = 3 }) {
  await ensureTable();
  const id = crypto.randomUUID();
  await query(
    "INSERT INTO excel_export_jobs(id,job_type,payload_json,status,max_attempts,requested_by,next_attempt_at) VALUES(?,?,?,'queued',?,?,NOW())",
    [id, type, JSON.stringify(payload || {}), Math.max(1, maxAttempts), requestedBy || null]
  );
  return get(id);
}

async function get(id) {
  await ensureTable();
  const rows = await query('SELECT * FROM excel_export_jobs WHERE id=? LIMIT 1', [id]);
  return normalize(rows[0]);
}

async function list(limit = 50) {
  await ensureTable();
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 50));
  const rows = await query('SELECT * FROM excel_export_jobs ORDER BY created_at DESC LIMIT ?', [safeLimit]);
  return rows.map(normalize);
}

async function claimNextReady() {
  await ensureTable();
  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      "SELECT id FROM excel_export_jobs WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()) ORDER BY created_at LIMIT 1 FOR UPDATE"
    );
    if (!rows[0]) {
      await connection.commit();
      return null;
    }
    const id = rows[0].id;
    const [result] = await connection.query(
      "UPDATE excel_export_jobs SET status='running',attempts=attempts+1,started_at=NOW(),finished_at=NULL,error_message=NULL WHERE id=? AND status='queued'",
      [id]
    );
    if (result.affectedRows !== 1) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
    return get(id);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function complete(id, result, metrics) {
  await query(
    "UPDATE excel_export_jobs SET status='completed',result_json=?,metrics_json=?,finished_at=NOW() WHERE id=?",
    [JSON.stringify(result || {}), JSON.stringify(metrics || {}), id]
  );
  return get(id);
}

async function fail(id, error, retryDelayMs = 30000) {
  const job = await get(id);
  const retry = job && job.attempts < job.maxAttempts;
  await query(
    'UPDATE excel_export_jobs SET status=?,error_message=?,finished_at=?,next_attempt_at=? WHERE id=?',
    [
      retry ? 'queued' : 'failed',
      String(error?.message || error),
      retry ? null : new Date(),
      retry ? new Date(Date.now() + retryDelayMs) : null,
      id
    ]
  );
  return get(id);
}

async function nextReady() {
  await ensureTable();
  const rows = await query(
    "SELECT * FROM excel_export_jobs WHERE status='queued' AND (next_attempt_at IS NULL OR next_attempt_at<=NOW()) ORDER BY created_at LIMIT 1"
  );
  return normalize(rows[0]);
}

async function recoverStaleRunning(maxAgeMinutes = 10) {
  await ensureTable();
  const minutes = Math.min(1440, Math.max(1, Number(maxAgeMinutes) || 10));
  const result = await query(
    `UPDATE excel_export_jobs
       SET status='queued',
           next_attempt_at=NOW(),
           finished_at=NULL,
           error_message='Recovered after backend restart or stale worker timeout'
     WHERE status='running'
       AND started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [minutes]
  );
  return Number(result?.affectedRows || 0);
}

module.exports = {
  ensureTable,
  create,
  get,
  list,
  claimNextReady,
  complete,
  fail,
  nextReady,
  recoverStaleRunning
};
