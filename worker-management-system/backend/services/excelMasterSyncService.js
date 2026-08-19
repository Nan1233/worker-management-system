const db = require('../config/db');
const { assertProcessesScope } = require('./processAuthorizationService');
const {
  ENTITY_CONFIGS,
  normalizeRow,
  businessKey,
  validateRows,
  collectWorkbookProcessIds
} = require('./excelMasterSyncValidationService');

async function loadExisting(connection, config, processIds) {
  if (!processIds.length) return [];
  const placeholders = processIds.map(() => '?').join(',');
  const [rows] = await connection.query(
    `SELECT id, ${config.fields.join(', ')}, status, source_hash FROM ${config.table} WHERE process_id IN (${placeholders})`,
    processIds
  );
  return rows;
}

function compareRows(config, validated, existingRows, options = {}) {
  const existing = new Map(existingRows.map((row) => [businessKey(config, normalizeRow(config, row).row), row]));
  const incomingKeys = new Set(validated.valid.map((item) => item.key));
  const changes = [];

  for (const item of validated.valid) {
    const old = existing.get(item.key);
    if (!old) {
      changes.push({ action: 'CREATE', ...item, oldData: null, newData: item.row, changedFields: config.fields });
      continue;
    }
    const normalizedOld = normalizeRow(config, old).row;
    const changedFields = config.fields.filter((field) => String(normalizedOld[field] ?? '') !== String(item.row[field] ?? ''));
    if (String(old.status || '').toLowerCase() !== 'active') {
      changes.push({ action: 'REACTIVATE', ...item, entityId: Number(old.id), oldData: normalizedOld, newData: item.row, changedFields: [...new Set([...changedFields, 'status'])] });
    } else if (changedFields.length) {
      changes.push({ action: 'UPDATE', ...item, entityId: Number(old.id), oldData: normalizedOld, newData: item.row, changedFields });
    } else {
      changes.push({ action: 'UNCHANGED', ...item, entityId: Number(old.id), oldData: normalizedOld, newData: item.row, changedFields: [] });
    }
  }

  if (options.allowDeactivate === true) {
    for (const old of existingRows) {
      const normalizedOld = normalizeRow(config, old).row;
      const key = businessKey(config, normalizedOld);
      if (!incomingKeys.has(key) && String(old.status || '').toLowerCase() === 'active') {
        changes.push({ action: 'DEACTIVATE', key, rowNumber: null, entityId: Number(old.id), oldData: normalizedOld, newData: null, changedFields: ['status'] });
      }
    }
  }
  return changes;
}

function summarize(changes, invalid) {
  const result = { total: changes.length + invalid.length, create: 0, update: 0, deactivate: 0, reactivate: 0, unchanged: 0, invalid: invalid.length };
  for (const change of changes) {
    const key = change.action.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(result, key)) result[key] += 1;
  }
  return result;
}

async function preview({ entityType, rows, allowDeactivate = false }, actor = null) {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) throw Object.assign(new Error('Loại dữ liệu đồng bộ không hợp lệ'), { statusCode: 400 });
  const processIds = collectWorkbookProcessIds(rows);
  if (actor) await assertProcessesScope(actor, processIds, { action: 'EXCEL_MASTER_SYNC_PREVIEW' });
  const validated = validateRows(config, rows);
  const connection = await db.promise().getConnection();
  try {
    const existing = await loadExisting(connection, config, processIds);
    const changes = compareRows(config, validated, existing, { allowDeactivate });
    return { entityType, changes, invalid: validated.invalid, summary: summarize(changes, validated.invalid) };
  } finally {
    connection.release();
  }
}

async function insertBatch(connection, payload, summary, userId) {
  const [result] = await connection.query(
    `INSERT INTO excel_sync_batches
      (file_name, file_hash, entity_type, status, total_rows, created_count, updated_count, deactivated_count, reactivated_count, unchanged_count, invalid_count, performed_by)
     VALUES (?, ?, ?, 'applying', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [payload.fileName || null, payload.fileHash || null, payload.entityType, summary.total, summary.create, summary.update, summary.deactivate, summary.reactivate, summary.unchanged, summary.invalid, userId || null]
  );
  return Number(result.insertId);
}

async function logChange(connection, batchId, entityType, change, sheetName) {
  await connection.query(
    `INSERT INTO excel_sync_logs
      (batch_id, entity_type, entity_id, business_key, action, sheet_name, source_row_number, old_data, new_data, changed_fields, message)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [batchId, entityType, change.entityId || null, change.key, change.action, sheetName || null, change.rowNumber || null,
      change.oldData ? JSON.stringify(change.oldData) : null,
      change.newData ? JSON.stringify(change.newData) : null,
      JSON.stringify(change.changedFields || []), change.message || null]
  );
}

async function apply(payload, actor) {
  const result = await preview(payload, actor);
  if (result.invalid.length && payload.rejectOnInvalid !== false) {
    throw Object.assign(new Error(`Có ${result.invalid.length} dòng không hợp lệ; chưa ghi dữ liệu`), {
      statusCode: 422,
      code: 'MASTER_VALIDATION_FAILED',
      details: result
    });
  }
  const activeCount = result.changes.filter((item) => item.action !== 'DEACTIVATE').length;
  const deactivationCount = result.summary.deactivate;
  const threshold = Number(payload.maxDeactivatePercent ?? 10);
  if (activeCount > 0 && deactivationCount / activeCount * 100 > threshold && payload.force !== true) {
    throw Object.assign(new Error(`Số bản ghi ngừng hoạt động vượt ${threshold}%; cần force=true sau khi kiểm tra`), { statusCode: 409, details: result });
  }

  const config = ENTITY_CONFIGS[payload.entityType];
  const connection = await db.promise().getConnection();
  let batchId;
  try {
    await connection.beginTransaction();
    batchId = await insertBatch(connection, payload, result.summary, actor?.id);
    for (const change of result.changes) {
      if (change.action === 'UNCHANGED') {
        await logChange(connection, batchId, payload.entityType, change, payload.sheetName);
        continue;
      }
      if (change.action === 'CREATE') {
        const columns = [...config.fields, 'status', 'source_hash', 'source_updated_at'];
        const values = [...config.fields.map((field) => change.newData[field]), 'active', change.hash, new Date()];
        const [inserted] = await connection.query(
          `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values
        );
        change.entityId = Number(inserted.insertId);
      } else if (change.action === 'UPDATE' || change.action === 'REACTIVATE') {
        const assignments = config.fields.map((field) => `${field} = ?`);
        await connection.query(
          `UPDATE ${config.table} SET ${assignments.join(', ')}, status = 'active', source_hash = ?, source_updated_at = NOW() WHERE id = ?`,
          [...config.fields.map((field) => change.newData[field]), change.hash, change.entityId]
        );
      } else if (change.action === 'DEACTIVATE') {
        await connection.query(`UPDATE ${config.table} SET status = 'inactive', source_updated_at = NOW() WHERE id = ?`, [change.entityId]);
      }
      await logChange(connection, batchId, payload.entityType, change, payload.sheetName);
    }
    await connection.query(`UPDATE excel_sync_batches SET status = 'completed', completed_at = NOW() WHERE id = ?`, [batchId]);
    await connection.commit();
    return { batchId, ...result };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listBatches(limit = 50, actor = null) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  if (String(actor?.role || '').toLowerCase() === 'admin') {
    const [rows] = await db.promise().query(`SELECT * FROM excel_sync_batches ORDER BY id DESC LIMIT ${safeLimit}`);
    return rows;
  }
  const actorId = Number(actor?.id);
  if (!Number.isInteger(actorId) || actorId <= 0) return [];
  const [rows] = await db.promise().query(`SELECT * FROM excel_sync_batches WHERE performed_by=? ORDER BY id DESC LIMIT ${safeLimit}`, [actorId]);
  return rows;
}

function processIdsFromSyncLogRows(rows) {
  const ids = new Set();
  for (const row of rows || []) {
    for (const raw of [row?.old_data, row?.new_data]) {
      if (!raw) continue;
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const id = Number(parsed?.process_id);
        if (Number.isInteger(id) && id > 0) ids.add(id);
      } catch (_) {}
    }
  }
  return [...ids];
}

async function getBatchLogs(batchId, actor = null) {
  const id = Number(batchId);
  if (!Number.isInteger(id) || id <= 0) return [];
  if (String(actor?.role || '').toLowerCase() !== 'admin') {
    const actorId = Number(actor?.id);
    const [batchRows] = await db.promise().query('SELECT id, performed_by FROM excel_sync_batches WHERE id=? LIMIT 1', [id]);
    if (!batchRows.length || Number(batchRows[0].performed_by) !== actorId) {
      const error = new Error('Không có quyền xem lịch sử đồng bộ này');
      error.statusCode = 403; error.code = 'PROCESS_SCOPE_FORBIDDEN'; throw error;
    }
  }
  const [rows] = await db.promise().query('SELECT * FROM excel_sync_logs WHERE batch_id = ? ORDER BY id', [id]);
  if (actor && String(actor?.role || '').toLowerCase() !== 'admin') {
    await assertProcessesScope(actor, processIdsFromSyncLogRows(rows), { action: 'EXCEL_MASTER_SYNC_HISTORY' });
  }
  return rows;
}

module.exports = { ENTITY_CONFIGS, preview, apply, listBatches, getBatchLogs };
