'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeTrainingPercent } = require('../utils/trainingPercent');

const DEFAULT_SOURCE = path.resolve(__dirname, '../data/mau-goc-ktc.json');
const APPLY = process.argv.includes('--apply');
const sourceArgIndex = process.argv.indexOf('--source');
const SOURCE = sourceArgIndex >= 0 && process.argv[sourceArgIndex + 1]
  ? path.resolve(process.cwd(), process.argv[sourceArgIndex + 1])
  : DEFAULT_SOURCE;
const CHUNK_SIZE = 150;

function normalizeWorkerCode(value) {
  return String(value ?? '').trim().toLocaleLowerCase('vi-VN');
}

function loadCanonicalTrainingMap(filePath = SOURCE) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(raw.workers) || raw.workers.length === 0) {
    throw new Error('Canonical data không có workers[]');
  }

  const byCode = new Map();
  const duplicates = [];
  const invalid = [];

  for (const worker of raw.workers) {
    const originalCode = String(worker?.worker_code ?? '').trim();
    const code = normalizeWorkerCode(originalCode);
    const numeric = Number(worker?.training_percent);
    if (!code || !Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
      invalid.push({ worker_code: originalCode || null, training_percent: worker?.training_percent ?? null });
      continue;
    }
    if (byCode.has(code)) {
      duplicates.push(originalCode);
      continue;
    }
    byCode.set(code, {
      worker_code: originalCode,
      full_name: worker?.full_name || null,
      training_percent: normalizeTrainingPercent(numeric, 100)
    });
  }

  if (invalid.length) {
    throw new Error(`Canonical data có ${invalid.length} worker training_percent không hợp lệ`);
  }
  if (duplicates.length) {
    throw new Error(`Canonical data trùng worker_code sau normalize: ${duplicates.slice(0, 10).join(', ')}`);
  }

  return {
    source: filePath,
    meta: raw.meta || {},
    byCode
  };
}

function chunks(items, size = CHUNK_SIZE) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function query(conn, sql, params = []) {
  const [rows] = await conn.query(sql, params);
  return rows;
}

async function loadDbWorkers(conn) {
  return query(conn, `
    SELECT id, worker_code, training_percent, status
      FROM workers
     ORDER BY id
  `);
}

function matchCanonicalWorkers(dbWorkers, canonical) {
  const matched = [];
  const missingInCanonical = [];
  const canonicalMatchedCodes = new Set();

  for (const dbWorker of dbWorkers) {
    const key = normalizeWorkerCode(dbWorker.worker_code);
    const source = canonical.byCode.get(key);
    if (!source) {
      missingInCanonical.push({
        worker_id: Number(dbWorker.id),
        worker_code: dbWorker.worker_code,
        current_training_percent: Number(dbWorker.training_percent)
      });
      continue;
    }
    canonicalMatchedCodes.add(key);
    matched.push({
      worker_id: Number(dbWorker.id),
      worker_code: dbWorker.worker_code,
      current_training_percent: Number(dbWorker.training_percent),
      training_percent: Number(source.training_percent),
      full_name: source.full_name
    });
  }

  const missingInDb = [];
  for (const [key, source] of canonical.byCode.entries()) {
    if (!canonicalMatchedCodes.has(key)) missingInDb.push(source);
  }

  return { matched, missingInCanonical, missingInDb };
}

async function countMissingSnapshots(conn, tableName, workerIds = null) {
  const safeTable = tableName === 'production_reports_temp' ? tableName
    : tableName === 'production_reports' ? tableName
      : (() => { throw new Error('Invalid table'); })();
  if (!workerIds || workerIds.length === 0) {
    const rows = await query(conn, `SELECT COUNT(*) AS total FROM ${safeTable} WHERE training_percent_snapshot IS NULL`);
    return Number(rows[0]?.total || 0);
  }
  let total = 0;
  for (const group of chunks(workerIds, 500)) {
    const placeholders = group.map(() => '?').join(',');
    const rows = await query(
      conn,
      `SELECT COUNT(*) AS total FROM ${safeTable} WHERE training_percent_snapshot IS NULL AND worker_id IN (${placeholders})`,
      group
    );
    total += Number(rows[0]?.total || 0);
  }
  return total;
}

async function applyWorkerPercentChunk(conn, group) {
  const cases = group.map(() => 'WHEN ? THEN ?').join(' ');
  const ids = group.map(() => '?').join(',');
  const params = [];
  for (const item of group) params.push(item.worker_id, item.training_percent);
  params.push(...group.map((item) => item.worker_id));
  const result = await query(
    conn,
    `UPDATE workers
        SET training_percent = CASE id ${cases} ELSE training_percent END
      WHERE id IN (${ids})`,
    params
  );
  return Number(result.affectedRows || 0);
}

async function applySnapshotChunk(conn, tableName, group) {
  const safeTable = tableName === 'production_reports_temp' ? tableName
    : tableName === 'production_reports' ? tableName
      : (() => { throw new Error('Invalid table'); })();
  const cases = group.map(() => 'WHEN ? THEN ?').join(' ');
  const ids = group.map(() => '?').join(',');
  const params = [];
  for (const item of group) params.push(item.worker_id, item.training_percent);
  params.push(...group.map((item) => item.worker_id));
  const result = await query(
    conn,
    `UPDATE ${safeTable}
        SET training_percent_snapshot = CASE worker_id ${cases} ELSE training_percent_snapshot END
      WHERE training_percent_snapshot IS NULL
        AND worker_id IN (${ids})`,
    params
  );
  return Number(result.affectedRows || 0);
}

async function main() {
  const db = require('../config/db');
  const canonical = loadCanonicalTrainingMap(SOURCE);
  const conn = await db.promise().getConnection();
  try {
    const dbWorkers = await loadDbWorkers(conn);
    const match = matchCanonicalWorkers(dbWorkers, canonical);
    const workerIds = match.matched.map((item) => item.worker_id);
    const changedMaster = match.matched.filter(
      (item) => Number(item.current_training_percent) !== Number(item.training_percent)
    );

    const before = {
      tempMissingAll: await countMissingSnapshots(conn, 'production_reports_temp'),
      approvedMissingAll: await countMissingSnapshots(conn, 'production_reports'),
      tempBackfillable: await countMissingSnapshots(conn, 'production_reports_temp', workerIds),
      approvedBackfillable: await countMissingSnapshots(conn, 'production_reports', workerIds)
    };

    const preview = {
      mode: APPLY ? 'APPLY' : 'DRY_RUN',
      source: canonical.source,
      sourceName: canonical.meta?.source_file_name || canonical.meta?.nguon || path.basename(canonical.source),
      canonicalWorkers: canonical.byCode.size,
      dbWorkers: dbWorkers.length,
      matchedWorkers: match.matched.length,
      masterRowsDifferent: changedMaster.length,
      dbWorkersMissingInCanonical: match.missingInCanonical.length,
      canonicalWorkersMissingInDb: match.missingInDb.length,
      before,
      unresolvedAfterBackfillEstimate: {
        temp: Math.max(0, before.tempMissingAll - before.tempBackfillable),
        approved: Math.max(0, before.approvedMissingAll - before.approvedBackfillable)
      },
      sampleMasterChanges: changedMaster.slice(0, 20),
      sampleDbWorkersMissingInCanonical: match.missingInCanonical.slice(0, 20),
      sampleCanonicalWorkersMissingInDb: match.missingInDb.slice(0, 20)
    };

    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    if (!APPLY) {
      process.stdout.write('DRY RUN ONLY. Dùng --apply để ghi dữ liệu.\n');
      return;
    }

    await conn.beginTransaction();
    let masterAffected = 0;
    let tempAffected = 0;
    let approvedAffected = 0;
    try {
      for (const group of chunks(match.matched)) {
        masterAffected += await applyWorkerPercentChunk(conn, group);
        tempAffected += await applySnapshotChunk(conn, 'production_reports_temp', group);
        approvedAffected += await applySnapshotChunk(conn, 'production_reports', group);
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }

    const after = {
      tempMissingAll: await countMissingSnapshots(conn, 'production_reports_temp'),
      approvedMissingAll: await countMissingSnapshots(conn, 'production_reports')
    };

    process.stdout.write(`${JSON.stringify({
      applied: true,
      masterAffected,
      tempSnapshotsAffected: tempAffected,
      approvedSnapshotsAffected: approvedAffected,
      after
    }, null, 2)}\n`);
  } finally {
    conn.release();
    await db.promise().end().catch(() => {});
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('TRAINING SNAPSHOT CANONICAL BACKFILL FAILED:', error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  normalizeWorkerCode,
  loadCanonicalTrainingMap,
  matchCanonicalWorkers
};
