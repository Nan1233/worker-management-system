const AuditService = require("../services/auditService");
const {
  query,
  getConnection,
  beginTransaction,
  commit,
  rollback,
  normalizeIds,
} = require("./productionTempModelShared");
const {
  createStandardResolver,
  assertStandardSnapshotConsistency,
} = require("../services/standardResolutionService");
const {
  assertKqdPolicySnapshotConsistency,
} = require("../services/kqdPolicySnapshotService");
const {
  assertApprovedEventForTempLine,
} = require("../services/machineProductionEventService");
const { serializeExtraData } = require("../services/productionApprovalService");
const { createApprovedReportVersion } = require("../services/approvedVersionSnapshotService");
const { assertReviewBatchSize } = require("../services/managerReportPaginationService");

const qRows = async (executor, sql, params = []) => await query(executor, sql, params);

function workPeriod(value) {
  const text = value instanceof Date
    ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`
    : String(value || "").slice(0, 7);
  const match = /^(\d{4})-(\d{2})$/.exec(text);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

async function loadLockedReportingPeriods(connection, rows) {
  const unique = new Map();
  for (const row of rows) {
    const period = workPeriod(row.work_date);
    const processId = Number(row.process_id);
    if (!period || !Number.isInteger(processId) || processId <= 0) continue;
    unique.set(`${period.year}-${period.month}-${processId}`, { ...period, processId });
  }
  const periods = [...unique.values()];
  if (!periods.length) return [];
  const clauses = periods.map(() => "(report_year=? AND report_month=? AND (process_id IS NULL OR process_id=?))");
  const params = periods.flatMap((item) => [item.year, item.month, item.processId]);
  return qRows(
    connection,
    `SELECT report_year, report_month, process_id
       FROM reporting_period_locks
      WHERE status='locked' AND (${clauses.join(" OR ")})`,
    params,
  );
}

function assertReportingPeriodUnlocked(item, lockedRows) {
  const period = workPeriod(item.work_date);
  if (!period) return;
  const processId = Number(item.process_id);
  const locked = lockedRows.some((row) =>
    Number(row.report_year) === period.year
    && Number(row.report_month) === period.month
    && (row.process_id === null || Number(row.process_id) === processId),
  );
  if (locked) {
    throw new Error(`Kỳ báo cáo ${period.year}-${String(period.month).padStart(2, "0")} đã khóa`);
  }
}

async function getTempMachineLines(tempReportId, connection) {
  const lines = await qRows(
    connection,
    `SELECT *
       FROM production_temp_machine_lines
      WHERE temp_report_id=?
      ORDER BY sort_order ASC, id ASC`,
    [Number(tempReportId)],
  );
  if (!lines.length) return [];

  const ids = lines.map((line) => Number(line.id)).filter(Boolean);
  const defects = await qRows(
    connection,
    `SELECT *
       FROM production_temp_machine_defects
      WHERE machine_line_id IN (${ids.map(() => "?").join(",")})
      ORDER BY machine_line_id ASC, id ASC`,
    ids,
  );
  const byLine = new Map();
  for (const defect of defects) {
    const key = Number(defect.machine_line_id);
    if (!byLine.has(key)) byLine.set(key, []);
    byLine.get(key).push(defect);
  }
  return lines.map((line) => ({ ...line, defects: byLine.get(Number(line.id)) || [] }));
}

async function copyMachineLinesToApproved(tempReportId, approvedReportId, connection) {
  const tempLines = await getTempMachineLines(tempReportId, connection);
  if (!tempLines.length) return [];

  const approvedIds = [];
  for (const line of tempLines) {
    const result = await query(
      connection,
      `INSERT INTO production_report_machine_lines
       (report_id,machine_event_id,machine_id,machine_code,product_standard_id,standard_version_id,machine_standard_id,product_code,
        machine_time_hours,standard_output,standard_time_seconds,standard_source,exclude_kqd_from_tt,ok_quantity,ng_quantity,
        maximum_output,deduction_time_hours,deductions_json,counted_output,earned_standard_hours,defects_json,sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        approvedReportId,
        line.machine_event_id || null,
        line.machine_id || null,
        line.machine_code,
        line.product_standard_id || null,
        line.standard_version_id || null,
        line.machine_standard_id || null,
        line.product_code,
        line.machine_time_hours,
        line.standard_output,
        line.standard_time_seconds || null,
        line.standard_source || "DEFAULT",
        Number(line.exclude_kqd_from_tt || 0) === 1 ? 1 : 0,
        line.ok_quantity,
        line.ng_quantity,
        line.maximum_output,
        line.deduction_time_hours || 0,
        serializeExtraData(line.deductions_json),
        line.counted_output || 0,
        line.earned_standard_hours || 0,
        serializeExtraData(line.defects_json),
        line.sort_order || 1,
      ],
    );
    const approvedLineId = Number(result.insertId);
    approvedIds.push(approvedLineId);

    for (const defect of line.defects || []) {
      await query(
        connection,
        `INSERT INTO production_report_machine_defects
         (machine_line_id,defect_type_id,defect_code,defect_name,quantity)
         VALUES (?,?,?,?,?)`,
        [
          approvedLineId,
          defect.defect_type_id || null,
          defect.defect_code || null,
          defect.defect_name || null,
          defect.quantity || 0,
        ],
      );
    }
  }
  return approvedIds;
}

async function validateApprovalSnapshot(item, connection, standardResolver) {
  const isMachineReport = String(item.operation_mode || "").toUpperCase() === "MACHINE";
  if (isMachineReport) {
    const tempLines = await getTempMachineLines(item.id, connection);
    if (!tempLines.length) {
      const error = new Error(`Báo cáo máy #${item.id} không có dòng máy để xác minh định mức`);
      error.status = 422;
      error.code = "STANDARD_SNAPSHOT_MISSING";
      error.isPublic = true;
      throw error;
    }
    for (const line of tempLines) {
      await assertApprovedEventForTempLine(connection, { report: item, line });
      const resolved = await standardResolver.resolveStandard({
        processId: item.process_id,
        productCode: line.product_code,
        machineId: line.machine_id,
        machineCode: line.machine_code,
        workDate: item.work_date,
      });
      assertStandardSnapshotConsistency({
        resolved,
        snapshot: {
          standardVersionId: line.standard_version_id,
          machineStandardId: line.machine_standard_id,
        },
      });
      assertKqdPolicySnapshotConsistency({
        report: item,
        machineLine: line,
      });
    }
    return;
  }

  const resolved = await standardResolver.resolveStandard({
    processId: item.process_id,
    productCode: item.product_name,
    machineId: null,
    machineCode: null,
    workDate: item.work_date,
  });
  assertStandardSnapshotConsistency({
    resolved,
    snapshot: {
      standardVersionId: item.standard_version_id,
      machineStandardId: item.machine_standard_id,
    },
  });
  assertKqdPolicySnapshotConsistency({ report: item });
}

// ... existing approval helpers and approveSelected implementation remain unchanged ...

async function rejectSelected(reports, reviewerId, reason) {
  const reportIds = normalizeIds(reports?.ids || reports);
  const expectedById = new Map((reports?.expected || []).map((item) => [Number(item.id), item.updated_at]));
  const cleanReason = String(reason || "").trim();
  if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối");

  const connection = await getConnection();
  const postCommitNotifications = [];
  try {
    await beginTransaction(connection);
    const placeholders = reportIds.map(() => "?").join(",");
    const isAdmin = Boolean(reviewerId?.isAdmin);
    const reviewer = Number(reviewerId?.id || reviewerId);
    const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id=temp.process_id";
    const scopeWhere = isAdmin ? "" : "AND mp.manager_id=?";
    const params = isAdmin ? [...reportIds] : [...reportIds, reviewer];
    const rows = await query(
      connection,
      `SELECT DISTINCT temp.id,temp.worker_id,temp.process_id,temp.work_date,temp.shift,temp.updated_at,
              w.user_id AS worker_user_id
         FROM production_reports_temp temp
         JOIN workers w ON w.id=temp.worker_id
         ${scopeJoin}
        WHERE temp.id IN (${placeholders})
          AND temp.status IN ('pending','need_fix')
          ${scopeWhere}
        ORDER BY temp.id ASC
        FOR UPDATE`,
      params,
    );
    if (rows.length !== reportIds.length) {
      const visibleIds = new Set(rows.map((row) => Number(row.id)));
      const missingIds = reportIds.filter((id) => !visibleIds.has(Number(id)));
      const error = new Error("Danh sách báo cáo đã thay đổi hoặc có báo cáo không còn trong phạm vi phê duyệt. Hãy tải lại danh sách rồi chọn lại.");
      error.status = 409;
      error.code = "APPROVAL_SELECTION_STALE";
      error.details = { requested_ids: reportIds, missing_ids: missingIds };
      throw error;
    }
    for (const row of rows) {
      const expected = expectedById.get(Number(row.id));
      if (expected && new Date(expected).getTime() !== new Date(row.updated_at).getTime()) {
        const error = new Error(`Báo cáo #${row.id} đã thay đổi sau khi bạn mở danh sách. Hãy tải lại trước khi thử lại.`);
        error.status = 409;
        error.code = "TEMP_REPORT_VERSION_CONFLICT";
        throw error;
      }
    }
    for (const row of rows) {
      await query(
        connection,
        `UPDATE production_reports_temp SET status='rejected',review_note=?,reviewed_by=?,updated_at=NOW() WHERE id=?`,
        [cleanReason, reviewer, row.id],
      );
      const rejectedSnapshot = await AuditService.loadTempReportSnapshot(row.id, connection);
      if (rejectedSnapshot) {
        await AuditService.createReportVersion({
          reportType: "temp", reportId: row.id, snapshot: rejectedSnapshot,
          reason: `Bị từ chối: ${cleanReason}`, userId: reviewer,
        }, connection);
      }
      await AuditService.logActivity({
        userId: reviewer,
        action: "REPORT_REJECTED",
        entityType: "temp_report",
        entityId: row.id,
        description: `Từ chối báo cáo #${row.id}: ${cleanReason}`,
        metadata: { reason: cleanReason, worker_id: row.worker_id, process_id: row.process_id },
      }, connection);
      postCommitNotifications.push({
        userIds: [row.worker_user_id],
        payload: {
          type: "report_rejected", title: "Báo cáo đã bị từ chối",
          message: `Báo cáo ngày ${String(row.work_date).slice(0,10)}, ca ${row.shift || "-"} bị từ chối: ${cleanReason}`,
          linkUrl: `/worker/history/${row.id}?source=pending`, entityType: "temp_report", entityId: row.id,
        },
      });
    }
    await commit(connection);
    for (const notification of postCommitNotifications) {
      try { await AuditService.notifyUsers(notification.userIds, notification.payload); }
      catch (error) { console.warn(`[KTC] Post-commit rejection notification failed: ${error.message}`); }
    }
    return { count: rows.length, ids: rows.map((row) => row.id) };
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { rejectSelected };
