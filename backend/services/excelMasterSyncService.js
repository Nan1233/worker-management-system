const { hasPermission } = require('./permissionService');
const db = require('../config/db');

const MAX_DEACTIVATE_PERCENT = 10;

function assertSyncActor(actor) {
  const actorId = Number(actor?.id);
  const role = String(actor?.role || '').trim().toLowerCase();

  if (!actor || !Number.isInteger(actorId) || actorId <= 0) {
    throw Object.assign(new Error('Yêu cầu xác thực'), {
      statusCode: 401,
      code: 'AUTH_REQUIRED'
    });
  }

  if (!['admin', 'manager'].includes(role)) {
    throw Object.assign(new Error('Không có quyền truy cập chức năng này'), {
      statusCode: 403,
      code: 'ROLE_DENIED'
    });
  }
}
function assertSyncOptionsAllowed(options = {}, actor = null) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw Object.assign(new Error('Thông tin đồng bộ không hợp lệ'), {
      statusCode: 400,
      code: 'MASTER_SYNC_OPTION_INVALID'
    });
  }

  const role = String(actor?.role || '').trim().toLowerCase();
  const isAdmin = role === 'admin';

  for (const field of ['allowDeactivate', 'force']) {
    if (options[field] !== undefined &&
        typeof options[field] !== 'boolean') {
      throw Object.assign(new Error(`Giá trị ${field} không hợp lệ`), {
        statusCode: 400,
        code: 'MASTER_SYNC_OPTION_INVALID'
      });
    }
  }

  if (options.allowDeactivate === true && !isAdmin) {
    throw Object.assign(
      new Error('Chỉ admin được phép ngừng kích hoạt dữ liệu master'),
      {
        statusCode: 403,
        code: 'MASTER_DEACTIVATE_ADMIN_REQUIRED'
      }
    );
  }

  if (options.force === true && !isAdmin) {
    throw Object.assign(
      new Error('Chỉ admin được phép xác nhận vượt ngưỡng đồng bộ'),
      {
        statusCode: 403,
        code: 'MASTER_FORCE_ADMIN_REQUIRED'
      }
    );
  }
}
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

async function preview(options = {}, actor = null) {
  assertSyncActor(actor);
  assertSyncOptionsAllowed(options, actor);
  const { entityType, rows, allowDeactivate = false } = options;
  if (!(await hasPermission(actor, 'EXCEL_MASTER_SYNC'))) throw Object.assign(new Error('Bạn không có quyền đồng bộ dữ liệu chuẩn từ Excel'), { statusCode:403, code:'PERMISSION_DENIED', isPublic:true });
  const config = ENTITY_CONFIGS[entityType];
  if (!config) throw Object.assign(new Error('Loại dữ liệu đồng bộ không hợp lệ'), { statusCode: 400 });
  const processIds = collectWorkbookProcessIds(rows);
  await assertProcessesScope(actor, processIds, { action: 'EXCEL_MASTER_SYNC_PREVIEW' });
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
  assertSyncActor(actor);
  assertSyncOptionsAllowed(payload, actor);
  if (!(await hasPermission(actor, 'EXCEL_MASTER_SYNC'))) throw Object.assign(new Error('Bạn không có quyền đồng bộ dữ liệu chuẩn từ Excel'), { statusCode:403, code:'PERMISSION_DENIED', isPublic:true });
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
  const threshold = MAX_DEACTIVATE_PERCENT;
  if (deactivationCount > 0 && (activeCount === 0 || deactivationCount / activeCount * 100 > threshold) && payload.force !== true) {
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
  assertSyncActor(actor);

  if (!(await hasPermission(actor, 'EXCEL_MASTER_SYNC'))) {
    throw Object.assign(
      new Error('Kh?ng c? quy?n xem l?ch s? ??ng b? Excel'),
      { statusCode: 403, code: 'PERMISSION_DENIED', isPublic: true }
    );
  }

  const requested = Number(limit);
  const safeLimit = Number.isFinite(requested)
    ? Math.min(200, Math.max(1, Math.trunc(requested)))
    : 50;

  if (String(actor.role).toLowerCase() === 'admin') {
    const [rows] = await db.promise().query(
      'SELECT * FROM excel_sync_batches ORDER BY id DESC LIMIT ?',
      [safeLimit]
    );
    return rows;
  }

  const visible = [];
  const pageSize = Math.max(50, safeLimit);
  let cursor = null;

  while (visible.length < safeLimit) {
    const sql = cursor === null
      ? 'SELECT * FROM excel_sync_batches WHERE performed_by=? ORDER BY id DESC LIMIT ?'
      : 'SELECT * FROM excel_sync_batches WHERE performed_by=? AND id<? ORDER BY id DESC LIMIT ?';

    const params = cursor === null
      ? [Number(actor.id), pageSize]
      : [Number(actor.id), cursor, pageSize];

    const [batches] = await db.promise().query(sql, params);

    if (!batches.length) break;

    const ids = batches.map(batch => Number(batch.id));

    if (ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
      throw new Error('Invalid Excel sync batch ID');
    }

    const placeholders = ids.map(() => '?').join(',');

    const [allLogs] = await db.promise().query(
      'SELECT * FROM excel_sync_logs WHERE batch_id IN (' +
        placeholders + ') ORDER BY batch_id, id',
      ids
    );

    const logsByBatch = new Map(ids.map(id => [id, []]));

    for (const log of allLogs) {
      const batchId = Number(log.batch_id);

      if (logsByBatch.has(batchId)) {
        logsByBatch.get(batchId).push(log);
      }
    }

    for (const batch of batches) {
      try {
        const processIds = processIdsFromSyncLogRows(
          logsByBatch.get(Number(batch.id))
        );

        await assertProcessesScope(actor, processIds, {
          action: 'EXCEL_MASTER_SYNC_HISTORY'
        });
      } catch (error) {
        if ([
          'PROCESS_SCOPE_FORBIDDEN',
          'MASTER_SYNC_HISTORY_PROCESS_UNKNOWN',
          'MASTER_SYNC_HISTORY_INVALID'
        ].includes(error.code)) {
          continue;
        }

        throw error;
      }

      visible.push(batch);

      if (visible.length >= safeLimit) break;
    }

    if (visible.length >= safeLimit || batches.length < pageSize) break;

    const nextCursor = Number(batches[batches.length - 1].id);

    if (!Number.isSafeInteger(nextCursor) || nextCursor <= 0 ||
        (cursor !== null && nextCursor >= cursor)) {
      throw new Error('Invalid Excel sync history pagination cursor');
    }

    cursor = nextCursor;
  }

  return visible;
}

function processIdsFromSyncLogRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw Object.assign(
      new Error('Không xác định được công đoạn của lịch sử đồng bộ'),
      {
        statusCode: 409,
        code: 'MASTER_SYNC_HISTORY_PROCESS_UNKNOWN'
      }
    );
  }

  const ids = new Set();

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      throw Object.assign(
        new Error('Dữ liệu lịch sử đồng bộ không hợp lệ'),
        { statusCode: 409, code: 'MASTER_SYNC_HISTORY_INVALID' }
      );
    }

    const rowIds = new Set();

    for (const raw of [row.old_data, row.new_data]) {
      if (raw === null || raw === undefined || raw === '') continue;

      let parsed;

      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (_) {
        throw Object.assign(
          new Error('Không thể xác minh dữ liệu lịch sử đồng bộ'),
          { statusCode: 409, code: 'MASTER_SYNC_HISTORY_INVALID' }
        );
      }

      if (parsed === null || typeof parsed !== 'object' ||
          Array.isArray(parsed)) {
        throw Object.assign(
          new Error('Cấu trúc dữ liệu lịch sử không hợp lệ'),
          { statusCode: 409, code: 'MASTER_SYNC_HISTORY_INVALID' }
        );
      }

      if (Object.prototype.hasOwnProperty.call(parsed, 'process_id')) {
        const id = Number(parsed.process_id);

        if (!Number.isInteger(id) || id <= 0) {
          throw Object.assign(
            new Error('Process ID trong lịch sử không hợp lệ'),
            { statusCode: 409, code: 'MASTER_SYNC_HISTORY_INVALID' }
          );
        }

        rowIds.add(id);
      }
    }

    if (rowIds.size === 0) {
      throw Object.assign(
        new Error('Lịch sử thiếu process_id, từ chối truy cập'),
        { statusCode: 409, code: 'MASTER_SYNC_HISTORY_PROCESS_UNKNOWN' }
      );
    }

    for (const id of rowIds) ids.add(id);
  }

  return [...ids];
}
async function getBatchLogs(batchId, actor = null) {
  assertSyncActor(actor);
  if (!(await hasPermission(actor, 'EXCEL_MASTER_SYNC'))) {
    throw Object.assign(new Error('Không có quyền xem lịch sử đồng bộ Excel'), {
      statusCode: 403,
      code: 'PERMISSION_DENIED',
      isPublic: true
    });
  }
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
  if (String(actor?.role || '').toLowerCase() !== 'admin') {
    await assertProcessesScope(actor, processIdsFromSyncLogRows(rows), { action: 'EXCEL_MASTER_SYNC_HISTORY' });
  }
  return rows;
}

module.exports = { ENTITY_CONFIGS, preview, apply, listBatches, getBatchLogs };
