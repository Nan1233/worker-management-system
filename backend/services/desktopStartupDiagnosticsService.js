'use strict';

// Diagnostics are intentionally constrained to timings and an opaque install ID.
// No credentials, user-agent strings, hostnames, paths or log text are accepted.
const db = require('../config/db');

const POINTS = ['process_start','excel_patches_ready','main_require_begin',
  'bundled_fe_ready','main_require_end','window_create_begin','window_created',
  'window_ready_to_show','frontend_loaded'];
const POINT_SET = new Set(POINTS);
const clampMs = (value) => Number.isFinite(Number(value))
  ? Math.min(600000, Math.max(0, Math.round(Number(value)))) : null;

let schemaPromise;
function ensureTable() {
  if (!schemaPromise) {
    schemaPromise = db.promise().query(`
      CREATE TABLE IF NOT EXISTS ktc_desktop_startup_diagnostics (
        id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        install_id CHAR(36) NOT NULL,
        version VARCHAR(32) NOT NULL,
        started_at DATETIME(3) NOT NULL,
        uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        platform VARCHAR(16) NOT NULL,
        arch VARCHAR(16) NOT NULL,
        portable TINYINT(1) NOT NULL,
        bundled_frontend TINYINT(1) NOT NULL,
        points_json JSON NOT NULL,
        KEY idx_ktc_startup_uploaded (uploaded_at),
        KEY idx_ktc_startup_install (install_id, uploaded_at)
      )`).catch((error) => { schemaPromise = null; throw error; });
  }
  return schemaPromise;
}

function normalize(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const installId = String(payload.installId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(installId)) return null;
  const startedAt = new Date(String(payload.startedAt || ''));
  if (!Number.isFinite(startedAt.getTime())) return null;
  if (Math.abs(Date.now() - startedAt.getTime()) > 7 * 86400000) return null;
  const version = String(payload.version || '').slice(0, 32);
  if (!/^[0-9A-Za-z._-]{1,32}$/.test(version)) return null;
  const platform = String(payload.platform || '').slice(0, 16);
  const arch = String(payload.arch || '').slice(0, 16);
  if (!['win32','linux','darwin'].includes(platform) || !['x64','arm64','ia32'].includes(arch)) return null;
  const points = {};
  for (const key of POINTS) {
    if (Object.prototype.hasOwnProperty.call(payload.points || {}, key)) {
      const ms = clampMs(payload.points[key]);
      if (ms === null) return null;
      points[key] = ms;
    }
  }
  if (points.process_start !== 0 || Object.keys(points).length < 2) return null;
  return { installId, version, startedAt: startedAt.toISOString().slice(0,23).replace('T',' '),
    platform, arch, portable: Boolean(payload.portable), bundledFrontend: Boolean(payload.bundledFrontend), points };
}

async function submit(userId, payload) {
  const record = normalize(payload);
  if (!record) return null;
  await ensureTable();
  const [result] = await db.promise().query(
    `INSERT INTO ktc_desktop_startup_diagnostics
       (user_id, install_id, version, started_at, platform, arch, portable, bundled_frontend, points_json)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [userId, record.installId, record.version, record.startedAt,
      record.platform, record.arch, Number(record.portable), Number(record.bundledFrontend), JSON.stringify(record.points)]
  );
  return Number(result.insertId || 0);
}

function analyze(points) {
  const stages = [
    ['excel_patches', 'process_start', 'excel_patches_ready'],
    ['pre_main', 'excel_patches_ready', 'main_require_begin'],
    ['bundled_frontend', 'main_require_begin', 'bundled_fe_ready'],
    ['main_module', 'bundled_fe_ready', 'main_require_end'],
    ['window_creation', 'window_create_begin', 'window_created'],
    ['window_render', 'window_created', 'window_ready_to_show'],
    ['frontend_load', 'window_created', 'frontend_loaded']
  ];
  const durationsMs = {};
  for (const [label, from, to] of stages) {
    if (typeof points[from] === 'number' && typeof points[to] === 'number' && points[to] >= points[from]) {
      durationsMs[label] = points[to] - points[from];
    }
  }
  const slowest = Object.entries(durationsMs).sort((a, b) => b[1] - a[1])[0] || null;
  return {
    durationsMs,
    slowestMeasuredPhase: slowest ? slowest[0] : null,
    slowestMeasuredMs: slowest ? slowest[1] : null,
    totalElectronMs: typeof points.window_ready_to_show === 'number'
      ? points.window_ready_to_show
      : typeof points.frontend_loaded === 'number' ? points.frontend_loaded : null,
    // Portable self-extraction happens before process_start and cannot be measured here.
    preElectronExtractionMeasured: false
  };
}

async function recent(limit = 30, userId = null) {
  await ensureTable();
  const take = Math.min(100, Math.max(1, Math.floor(Number(limit) || 30)));
  const [rows] = await db.promise().query(
    `SELECT id, user_id, install_id, version, started_at, uploaded_at,
            platform, arch, portable, bundled_frontend, points_json
       FROM ktc_desktop_startup_diagnostics
      ${userId ? 'WHERE user_id=?' : ''} ORDER BY id DESC LIMIT ${take}`,
    userId ? [userId] : []
  );
  return (rows || []).map((row) => {
    let points = row.points_json;
    if (typeof points === 'string') { try { points = JSON.parse(points); } catch { points = {}; } }
    return { id: row.id, userId: row.user_id, installId: row.install_id,
      version: row.version, startedAt: row.started_at, uploadedAt: row.uploaded_at,
      platform: row.platform, arch: row.arch, portable: Boolean(row.portable),
      bundledFrontend: Boolean(row.bundled_frontend), points: points || {}, analysis: analyze(points || {}) };
  });
}

module.exports = { normalize, submit, recent, analyze, POINT_SET };
