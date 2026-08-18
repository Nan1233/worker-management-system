const db = require('../config/db');

const json = (value) => JSON.stringify(value ?? null);
const query = (executor, sql, params = []) => executor.promise
  ? executor.promise().query(sql, params)
  : executor.query(sql, params);

let schemaReadyPromise = null;

/**
 * Read-only notification schema capability check.
 *
 * Production/TiDB schema is managed outside the application runtime. This
 * function deliberately performs metadata reads only; it never ALTERs or
 * CREATEs database objects. Callers can therefore run safely against both
 * the current notification schema and older deployments.
 */
async function ensureSchema(executor = db) {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      const [rows] = await query(
        executor,
        `SELECT COLUMN_NAME
           FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'notifications'`,
      );
      const columns = new Set(rows.map((row) => String(row.COLUMN_NAME).toLowerCase()));
      return Object.freeze({
        linkUrl: columns.has('link_url'),
        entityType: columns.has('entity_type'),
        entityId: columns.has('entity_id'),
        extended: columns.has('link_url') && columns.has('entity_type') && columns.has('entity_id'),
      });
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
  const [rows] = await query(
    executor,
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
       FROM report_versions
      WHERE report_type=? AND report_id=?`,
    [reportType, reportId],
  );

  const versionNo = Number(rows[0]?.next_version || 1);

  await query(
    executor,
    `INSERT INTO report_versions
      (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      String(reportType || 'approved'),
      Number(reportId),
      versionNo,
      json(snapshot),
      reason ? String(reason).slice(0, 500) : null,
      Number(userId) || null,
    ],
  );

  return versionNo;
}


async function loadTempReportSnapshot(reportId, executor = db) {
  const [reportRows] = await query(
    executor,
    `SELECT * FROM production_reports_temp WHERE id=? LIMIT 1`,
    [Number(reportId)],
  );
  const report = reportRows[0];
  if (!report) return null;

  const [[defects], [deductions], [machineLines]] = await Promise.all([
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
    const [rows] = await query(
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

async function notifyUsers(userIds, payload, executor = db) {
  const ids = [...new Set((userIds || [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];

  if (!ids.length) return;

  const schema = await ensureSchema(executor);
  const columns = ['user_id', 'type', 'title', 'message'];
  if (schema.linkUrl) columns.push('link_url');
  if (schema.entityType) columns.push('entity_type');
  if (schema.entityId) columns.push('entity_id');

  const values = ids.map(() => `(${columns.map(() => '?').join(',')})`).join(',');
  const params = ids.flatMap((id) => {
    const row = [id, payload.type || 'info', payload.title, payload.message];
    if (schema.linkUrl) row.push(payload.linkUrl || null);
    if (schema.entityType) row.push(payload.entityType || null);
    if (schema.entityId) row.push(payload.entityId || null);
    return row;
  });

  await query(
    executor,
    `INSERT INTO notifications (${columns.join(',')}) VALUES ${values}`,
    params,
  );
}

module.exports = {
  ensureSchema,
  logActivity,
  createReportVersion,
  loadTempReportSnapshot,
  notifyUsers,
};
