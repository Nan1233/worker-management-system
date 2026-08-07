const crypto = require('node:crypto');
const db = require('../config/db');

const ENTITY_CONFIGS = Object.freeze({
  product_standards: {
    table: 'product_standards',
    keyFields: ['process_id', 'product_code'],
    fields: ['process_id', 'product_code', 'standard_output', 'exclude_kqd_from_tt'],
    required: ['process_id', 'product_code', 'standard_output'],
    numberFields: ['process_id', 'standard_output', 'exclude_kqd_from_tt']
  },
  defect_types: {
    table: 'defect_types',
    keyFields: ['process_id', 'defect_code'],
    fields: ['process_id', 'defect_code', 'defect_name', 'sort_order', 'excel_column'],
    required: ['process_id', 'defect_code', 'defect_name'],
    numberFields: ['process_id', 'sort_order']
  },
  deduction_types: {
    table: 'deduction_types',
    keyFields: ['process_id', 'deduction_code'],
    fields: ['process_id', 'deduction_code', 'deduction_name', 'sort_order', 'excel_column'],
    required: ['process_id', 'deduction_code', 'deduction_name'],
    numberFields: ['process_id', 'sort_order']
  },
  machines: {
    table: 'machines',
    keyFields: ['process_id', 'machine_code'],
    fields: ['process_id', 'machine_code', 'machine_name'],
    required: ['process_id', 'machine_code', 'machine_name'],
    numberFields: ['process_id']
  }
});

function normalizeText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeRow(config, raw) {
  const row = {};
  for (const field of config.fields) {
    let value = raw?.[field];
    if (config.numberFields.includes(field)) {
      value = value === '' || value === null || value === undefined ? 0 : Number(value);
      if (!Number.isFinite(value)) value = 0;
    } else {
      value = normalizeText(value);
      if (field.endsWith('_code') || field === 'excel_column') value = normalizeCode(value);
    }
    row[field] = value;
  }
  return row;
}

function businessKey(config, row) {
  return config.keyFields.map((field) => String(row[field] ?? '')).join('|');
}

function stableObject(config, row) {
  const result = {};
  for (const field of config.fields) result[field] = row[field] ?? null;
  return result;
}

function hashRow(config, row) {
  return crypto.createHash('sha256').update(JSON.stringify(stableObject(config, row))).digest('hex');
}

function validateRows(config, rows) {
  const valid = [];
  const invalid = [];
  const seen = new Map();

  (rows || []).forEach((raw, index) => {
    const row = normalizeRow(config, raw);
    const rowNumber = Number(raw?.__rowNumber) || index + 2;
    const missing = config.required.filter((field) => row[field] === '' || row[field] === null || row[field] === undefined || (config.numberFields.includes(field) && !Number.isFinite(Number(row[field]))));
    const key = businessKey(config, row);
    if (missing.length) {
      invalid.push({ rowNumber, row, message: `Thiếu trường bắt buộc: ${missing.join(', ')}` });
      return;
    }
    if (seen.has(key)) {
      invalid.push({ rowNumber, row, message: `Trùng khóa với dòng ${seen.get(key)}` });
      return;
    }
    seen.set(key, rowNumber);
    valid.push({ rowNumber, row, key, hash: hashRow(config, row) });
  });
  return { valid, invalid };
}

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
  const existing = new Map(existingRows.map((row) => [businessKey(config, normalizeRow(config, row)), row]));
  const incomingKeys = new Set(validated.valid.map((item) => item.key));
  const changes = [];

  for (const item of validated.valid) {
    const old = existing.get(item.key);
    if (!old) {
      changes.push({ action: 'CREATE', ...item, oldData: null, newData: item.row, changedFields: config.fields });
      continue;
    }
    const normalizedOld = normalizeRow(config, old);
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
      const normalizedOld = normalizeRow(config, old);
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

async function preview({ entityType, rows, allowDeactivate = false }) {
  const config = ENTITY_CONFIGS[entityType];
  if (!config) throw Object.assign(new Error('Loại dữ liệu đồng bộ không hợp lệ'), { statusCode: 400 });
  const validated = validateRows(config, rows);
  const processIds = [...new Set(validated.valid.map((item) => Number(item.row.process_id)).filter((id) => id > 0))];
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

async function apply(payload, userId) {
  const result = await preview(payload);
  if (result.invalid.length && payload.rejectOnInvalid !== false) {
    throw Object.assign(new Error(`Có ${result.invalid.length} dòng không hợp lệ; chưa ghi dữ liệu`), { statusCode: 422, details: result });
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
    batchId = await insertBatch(connection, payload, result.summary, userId);
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

async function listBatches(limit = 50) {
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const [rows] = await db.promise().query(`SELECT * FROM excel_sync_batches ORDER BY id DESC LIMIT ${safeLimit}`);
  return rows;
}

async function getBatchLogs(batchId) {
  const [rows] = await db.promise().query('SELECT * FROM excel_sync_logs WHERE batch_id = ? ORDER BY id', [batchId]);
  return rows;
}

module.exports = { ENTITY_CONFIGS, preview, apply, listBatches, getBatchLogs };
