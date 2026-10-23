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

// mysql2/promise returns [rows, fields] for SELECT and [ResultSetHeader, fields]
// for INSERT/UPDATE/DELETE — the second element is only ever field metadata, never
// part of the payload. The legacy callback executor returns rows (or the header)
// directly. Normalize both shapes so snapshots and MAX(version_no) never
// accidentally serialize the mysql2 result tuple itself, and so INSERT callers
// (e.g. createReportVersion) can read result.insertId instead of getting back the
// raw [header, fields] tuple.
const query = async (executor, sql, params = []) => {
  if (executor && typeof executor.promise === 'function') {
    const result = await executor.promise().query(sql, params);
    return Array.isArray(result) && result.length === 2
      ? result[0]
      : result;
  }

  if (executor && typeof executor.query === 'function') {
    // Support both callback-style mysql connections and promise-returning
    // test/fake executors. A promise-returning executor may not invoke the
    // callback argument at all.
    if (executor.query.length < 3) {
      const result = await executor.query(sql, params);
      return Array.isArray(result) && result.length === 2
        ? result[0]
        : result;
    }
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
  if (process.env.KTC_RUNTIME_SCHEMA_REPAIR !== '1') return true;
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

// Cloudflare Workers talk to TiDB Serverless over HTTP, where insertId metadata and session state
// (LAST_INSERT_ID) are not reliable. Evaluated per call so tests can switch it.
function usesExplicitVersionAllocation() {
  return process.env.KTC_CLOUDFLARE_WORKER === 'true' || Boolean(globalThis.__KTC_CLOUDFLARE_WORKER);
}

async function createReportVersion(
  {
    reportType,
    reportId,
    snapshot,
    reason = null,
    userId = null,
    // false: the caller never uses the returned version number, so on the Cloudflare path the number does not have
    // to be read first and written second; one INSERT ... SELECT allocates and writes it (one subrequest fewer).
    returnVersionNo = true,
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

  // report_versions.id is a global AUTO_INCREMENT key; callers (e.g. restoring back to a specific
  // version_no) must receive the per-report version_no, never that id.
  //
  // The version number is always one this call itself allocated or one the database reported for
  // this very INSERT. It is never guessed by reading "the latest row" afterwards, because a
  // concurrent writer for the same report could be that latest row.
  //
  // Both paths rely on UNIQUE KEY uq_report_version (report_type, report_id, version_no): a
  // concurrent writer that takes the same number makes the INSERT fail with a duplicate-key error
  // and this call retries with a fresh number.
  const explicitAllocation = usesExplicitVersionAllocation();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      if (explicitAllocation) {
        if (returnVersionNo === false) {
          await query(
            executor,
            `INSERT INTO report_versions
              (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
             SELECT ?, ?, COALESCE(MAX(version_no), 0) + 1, ?, ?, ?
               FROM report_versions
              WHERE report_type=? AND report_id=?`,
            [normalizedType, normalizedReportId, snapshotJson, changeReason, createdBy, normalizedType, normalizedReportId],
          );
          return null;
        }
        // Cloudflare / TiDB Serverless (HTTP): the driver may not return insertId or LAST_INSERT_ID(expr)
        // for INSERT ... SELECT, and every statement outside a transaction can be a separate session,
        // so nothing can be read back afterwards. Allocate the number first, then insert it explicitly.
        const nextRows = await query(
          executor,
          `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_version
             FROM report_versions
            WHERE report_type=? AND report_id=?`,
          [normalizedType, normalizedReportId],
        );
        const nextVersion = Number(nextRows?.[0]?.next_version ?? nextRows?.[0]?.nextVersion ?? 0);
        if (!Number.isInteger(nextVersion) || nextVersion <= 0) {
          throw new Error('Không thể xác định version_no tiếp theo');
        }
        await query(
          executor,
          `INSERT INTO report_versions
            (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [normalizedType, normalizedReportId, nextVersion, snapshotJson, changeReason, createdBy],
        );
        return nextVersion;
      }

      // MySQL driver path: one statement; LAST_INSERT_ID(expr) overrides the session's last-insert-id
      // with the computed version_no, so result.insertId is the per-report version number.
      const result = await query(
        executor,
        `INSERT INTO report_versions
          (report_type, report_id, version_no, snapshot_json, change_reason, created_by)
         SELECT ?, ?, LAST_INSERT_ID(COALESCE(MAX(version_no), 0) + 1), ?, ?, ?
           FROM report_versions
          WHERE report_type=? AND report_id=?`,
        [
          normalizedType,
          normalizedReportId,
          snapshotJson,
          changeReason,
          createdBy,
          normalizedType,
          normalizedReportId,
        ],
      );
      const versionNo = Number(result?.insertId ?? result?.lastInsertId ?? 0);
      if (!Number.isInteger(versionNo) || versionNo <= 0) {
        // The row may exist but its number is unknown. Fail loudly rather than guess.
        throw new Error('Không thể xác định version_no vừa tạo');
      }
      return versionNo;
    } catch (error) {
      const message = String(error?.message || '');
      const duplicateVersion =
        error?.code === 'ER_DUP_ENTRY'
        || /duplicate entry|duplicate key|already exists/i.test(message);
      if (!duplicateVersion || attempt === 4) throw error;
    }
  }
  throw new Error('Không thể tạo report version sau nhiều lần thử');
}

async function loadTempReportSnapshot(reportId, executor = db, preloaded = null) {
  const normalizedReportId = Number(reportId);
  // Lock the temp-report row for the lifetime of the caller's transaction so a
  // concurrent update/approve/reject cannot interleave between this snapshot read
  // and the caller's own write, which would otherwise let the audit trail record a
  // "before" or "after" snapshot that never actually existed as a consistent state.
  // Outside a transaction (autocommit) FOR UPDATE is a harmless no-op lock that is
  // released immediately after this statement.
  // `preloaded.report` is a row the caller already read FOR UPDATE in this same transaction.
  const report = preloaded?.report && Number(preloaded.report.id) === normalizedReportId
    ? preloaded.report
    : (await query(
      executor,
      `SELECT * FROM production_reports_temp WHERE id=? LIMIT 1 FOR UPDATE`,
      [normalizedReportId],
    ))[0];
  if (!report) return null;

  // TiDB Serverless transactions cannot execute multiple statements
  // concurrently on the same transaction. Snapshot reads are intentionally
  // sequential whenever the supplied executor is transaction-scoped.
  // `preloaded.defects` / `preloaded.deductions`: rows the caller knows are unchanged since it read them in this
  // transaction (e.g. the "after" snapshot of an edit that did not touch them).
  const defects = Array.isArray(preloaded?.defects) ? preloaded.defects : await query(
    executor,
    `SELECT d.id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity
       FROM production_temp_defects d
       LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
      WHERE d.temp_report_id=? ORDER BY d.id`,
    [normalizedReportId],
  );

  const deductions = Array.isArray(preloaded?.deductions) ? preloaded.deductions : await query(
    executor,
    `SELECT d.id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours
       FROM production_temp_deductions d
       LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
      WHERE d.temp_report_id=? ORDER BY d.id`,
    [normalizedReportId],
  );

  // Subrequest budget: a caller that already holds this report's temp machine lines (with their `defects`)
  // inside the same transaction may pass them in instead of having them read twice.
  const hasPreloadedLines = Array.isArray(preloaded?.machineLines);
  const machineLines = hasPreloadedLines
    ? preloaded.machineLines.map(({ defects: _ignored, ...line }) => line)
    : await query(
      executor,
      `SELECT * FROM production_temp_machine_lines
        WHERE temp_report_id=? ORDER BY sort_order,id`,
      [normalizedReportId],
    );

  const machineIds = machineLines.map((line) => Number(line.id)).filter(Boolean);
  let machineDefects = [];
  if (hasPreloadedLines) {
    machineDefects = preloaded.machineLines.flatMap((line) => line.defects || []);
  } else if (machineIds.length) {
    machineDefects = await query(
      executor,
      `SELECT * FROM production_temp_machine_defects
        WHERE machine_line_id IN (${machineIds.map(() => '?').join(',')})
        ORDER BY machine_line_id,id`,
      machineIds,
    );
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
