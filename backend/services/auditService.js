const db = require('../config/db');

const toPlainValue = (value, seen = new WeakSet()) => {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => toPlainValue(item, seen));
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '_buf' || key === '_clientEncoding' || key === '_catalogLength' || key === '_catalogStart'
      || key === '_schemaLength' || key === '_schemaStart' || key === '_tableLength' || key === '_tableStart'
      || key === '_orgTableLength' || key === '_orgTableStart' || key === '_orgNameLength' || key === '_orgNameStart') continue;
    output[key] = toPlainValue(item, seen);
  }
  return output;
};

const json = (value) => JSON.stringify(toPlainValue(value) ?? null);

// mysql2/promise returns [rows, fields]. The legacy callback executor returns
// rows directly. Normalize both shapes so snapshots and MAX(version_no) never
// accidentally serialize the mysql2 result tuple itself.
const query = async (executor, sql, params = []) => {
  if (executor && typeof executor.promise === 'function') {
    const result = await executor.promise().query(sql, params);
    return Array.isArray(result) && result.length === 2 && Array.isArray(result[0])
      ? result[0]
      : result;
  }

  if (executor && typeof executor.query === 'function') {
    return new Promise((resolve, reject) => {
      executor.query(sql, params, (error, rows) => {
        if (error) return reject(error);
        resolve(rows);
      });
    });
  }

  throw new TypeError('Database executor is invalid');
};

let schemaReadyPromise = null;

async function ensureSchema(executor = db) {
  // Existing TiDB deployments may predate the notification link/entity columns.
  // Repair only the missing additive columns so notification writes remain compatible.
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const rows = await query(
        executor,
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'notifications'`,
      );
      const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
      const additions = [
        ['link_url', 'VARCHAR(1000) NULL AFTER message'],
        ['entity_type', 'VARCHAR(80) NULL AFTER link_url'],
        ['entity_id', 'BIGINT NULL AFTER entity_type'],
      ];

      for (const [column, definition] of additions) {
        if (columns.has(column)) continue;
        try {
          await query(executor, `ALTER TABLE notifications ADD COLUMN ${column} ${definition}`);
        } catch (error) {
          if (!/duplicate column|already exists/i.test(String(error?.message || ''))) throw error;
        }
      }

      try {
        await query(
          executor,
          'CREATE INDEX idx_notification_entity ON notifications (entity_type, entity_id)',
        );
      } catch (error) {
        if (!/duplicate key name|already exists/i.test(String(error?.message || ''))) throw error;
      }

      return true;
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

async function logActivity(
  {
    userId = null,
    action,
    entityType = null,
    entityId = null,
    description = null,
    metadata = null,
    req = null,
  },
  executor = db,
) {
  await ensureSchema(executor);
  await query(
    executor,
    `INSERT INTO activity_logs
      (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      Number(userId) || null,
      String(action || 'UNKNOWN').slice(0, 80),
      entityType ? String(entityType).slice(0, 80) : null,
      entityId === null || entityId === undefined ? null : String(entityId).slice(0, 100),
      description ? String(description).slice(0, 500) : null,
      json(metadata),
      req?.ip || null,
      req?.headers?.['user-agent'] || null,
    ],
  );
}

async function createReportVersion(
  {
    reportType,
    reportId,
    snapshot,
    reason = null,
    userId = null,
  },
  executor = db,
) {
  await ensureSchema(executor);

  const normalizedType = String(reportType || 'approved');
  const normalizedReportId = Number(reportId);
  if (!Number.isInteger(normalizedReportId) || normalizedReportId <= 0) {
    throw new Error('reportId không hợp lệ');
  }
  const snapshotJson = json(snapshot);
  const changeReason = reason ? String(reason).slice(0, 500) : null;
  const createdBy = Number(userId) || null;

  // TiDB/MySQL transactions can use a repeatable-read snapshot. A plain
  // SELECT MAX() can therefore miss a version committed by another
  // transaction after this transaction started. SELECT ... FOR UPDATE is a
  // locking/current read and prevents the stale version=1 retry loop that
  // previously caused uq_report_version failures during Reject Selected.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rows = await query(
      executor,
      `SELECT version_no
         FROM report_versions
        WHERE report_type=? AND report_id=?
        ORDER BY version_no DESC
        LIMIT 1
        FOR UPDATE`,
      [normalizedType, normalizedReportId],
    );

    const currentVersion = Number(rows[0]?.version_no || 0);
    const versionNo = currentVersion + 1;

    try {
      await query(
        executor,
        `INSERT INTO report_versions
          (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          normalizedType,
          normalizedReportId,
          versionNo,
          snapshotJson,
          changeReason,
          createdBy,
        ],
      );
      return versionNo;
    } catch (error) {
      const message = String(error?.message || '');
      const duplicateVersion =
        error?.code === 'ER_DUP_ENTRY'
        || /duplicate entry|duplicate key|already exists/i.test(message);

      if (!duplicateVersion || attempt === 4) throw error;
      // A concurrent writer won the candidate version. Re-run the locking
      // read on the same connection so the next attempt sees the latest row.
    }
  }

  throw new Error('Không thể tạo report version sau nhiều lần thử');
}

async function loadTempReportSnapshot(reportId, executor = db) {
  const reportRows = await query(
    executor,
    `SELECT * FROM production_reports_temp WHERE id=? LIMIT 1`,
    [Number(reportId)],
  );
  const report = reportRows[0];
  if (!report) return null;

  const [defects, deductions, machineLines] = await Promise.all([
    query(
      executor,
      `SELECT d.id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity
         FROM production_temp_defects d
         LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
        WHERE d.temp_report_id=? ORDER BY d.id`,
      [Number(reportId)],
    ),
    query(
      executor,
      `SELECT d.id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours
         FROM production_temp_deductions d
         LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
        WHERE d.temp_report_id=? ORDER BY d.id`,
      [Number(reportId)],
    ),
    query(
      executor,
      `SELECT * FROM production_temp_machine_lines
        WHERE temp_report_id=? ORDER BY sort_order,id`,
      [Number(reportId)],
    ),
  ]);

  const machineIds = machineLines.map((line) => Number(line.id)).filter(Boolean);
  let machineDefects = [];
  if (machineIds.length) {
    const rows = await query(
      executor,
      `SELECT * FROM production_temp_machine_defects
        WHERE machine_line_id IN (${machineIds.map(() => '?').join(',')})
        ORDER BY machine_line_id,id`,
      machineIds,
    );
    machineDefects = rows;
  }
  const defectsByMachine = new Map();
  machineDefects.forEach((item) => {
    const key = Number(item.machine_line_id);
    if (!defectsByMachine.has(key)) defectsByMachine.set(key, []);
    defectsByMachine.get(key).push(item);
  });

  return {
    ...report,
    defects,
    deductions,
    machine_lines: machineLines.map((line) => ({
      ...line,
      defects: defectsByMachine.get(Number(line.id)) || [],
    })),
  };
}

async function logActivities(entries, executor = db) {
  const items = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!items.length) return;
  await ensureSchema(executor);
  const values = items.map(() => '(?,?,?,?,?,?,?,?)').join(',');
  const params = items.flatMap((entry) => [
    Number(entry.userId) || null,
    String(entry.action || 'UNKNOWN').slice(0, 80),
    entry.entityType ? String(entry.entityType).slice(0, 80) : null,
    entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId).slice(0, 100),
    entry.description ? String(entry.description).slice(0, 500) : null,
    json(entry.metadata),
    entry.req?.ip || null,
    entry.req?.headers?.['user-agent'] || null,
  ]);
  await query(
    executor,
    `INSERT INTO activity_logs
      (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
     VALUES ${values}`,
    params,
  );
}

async function notifyBatch(entries, executor = db) {
  const items = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!items.length) return;
  await ensureSchema(executor);
  const normalized = [];
  for (const entry of items) {
    const ids = [...new Set((entry.userIds || [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0))];
    for (const id of ids) normalized.push({ id, payload: entry.payload || {} });
  }
  if (!normalized.length) return;
  const values = normalized.map(() => '(?,?,?,?,?,?,?)').join(',');
  const params = normalized.flatMap(({ id, payload }) => [
    id, payload.type || 'info', payload.title, payload.message,
    payload.linkUrl || null, payload.entityType || null, payload.entityId || null,
  ]);
  await query(
    executor,
    `INSERT INTO notifications
      (user_id,type,title,message,link_url,entity_type,entity_id)
     VALUES ${values}`,
    params,
  );
}

async function notifyUsers(userIds, payload, executor = db) {
  const ids = [...new Set((userIds || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) return;

  await ensureSchema(executor);

  const values = ids.map(() => '(?,?,?,?,?,?,?)').join(',');
  const params = ids.flatMap((id) => [
    id,
    payload.type || 'info',
    payload.title,
    payload.message,
    payload.linkUrl || null,
    payload.entityType || null,
    payload.entityId || null,
  ]);

  await query(
    executor,
    `INSERT INTO notifications
      (user_id,type,title,message,link_url,entity_type,entity_id)
     VALUES ${values}`,
    params,
  );
}

module.exports = {
  ensureSchema,
  logActivity,
  logActivities,
  createReportVersion,
  loadTempReportSnapshot,
  notifyUsers,
  notifyBatch,
};
