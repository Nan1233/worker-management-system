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
        standardOutput: line.standard_output,
        standardVersionId: line.standard_version_id,
        machineStandardId: line.machine_standard_id,
      });
      assertKqdPolicySnapshotConsistency({
        resolved,
        snapshot: line.exclude_kqd_from_tt,
      });
    }
    return;
  }

  const resolved = await standardResolver.resolveStandard({
    processId: item.process_id,
    productCode: item.product_name,
    workDate: item.work_date,
  });
  assertStandardSnapshotConsistency({
    resolved,
    standardOutput: item.standard_output,
    standardVersionId: item.standard_version_id,
    machineStandardId: item.machine_standard_id,
  });
  assertKqdPolicySnapshotConsistency({
    resolved,
    snapshot: item.exclude_kqd_from_tt_snapshot,
  });
}

async function createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection) {
  const [snapshotDefects, snapshotDeductions] = await Promise.all([
    qRows(
      connection,
      `SELECT dt.defect_code, dt.defect_name, d.quantity
         FROM production_report_defects d
         LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
        WHERE d.report_id=? ORDER BY d.id`,
      [approvedReportId],
    ),
    qRows(
      connection,
      `SELECT dt.deduction_code, dt.deduction_name, d.hours
         FROM production_report_deductions d
         LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
        WHERE d.report_id=? ORDER BY d.id`,
      [approvedReportId],
    ),
  ]);
  const machineLines = await qRows(
    connection,
    `SELECT * FROM production_report_machine_lines WHERE report_id=? ORDER BY sort_order ASC, id ASC`,
    [approvedReportId],
  );
  const snapshotData = JSON.stringify({
    report: {
      id: approvedReportId,
      source_temp_id: item.id,
      worker_id: item.worker_id,
      process_id: item.process_id,
      work_date: item.work_date,
      entry_date: item.entry_date || item.work_date,
      shift: item.shift,
      operation_type: item.operation_type ?? null,
      operation_mode: item.operation_mode ?? null,
      machine_no: item.machine_no,
      product_code: item.product_name,
      total_time: Number(item.total_time || 0),
      actual_time: Number(item.actual_time || 0),
      deduction_time: Number(item.deduction_time || 0),
      standard_output: Number(item.standard_output || 0),
      actual_output: Number(item.actual_output || 0),
      tt_ok: Number(item.tt_ok || 0),
      tt_ng: Number(item.tt_ng || 0),
      standard_version_id: item.standard_version_id || null,
      machine_standard_id: item.machine_standard_id || null,
      training_percent_snapshot: item.training_percent_snapshot ?? null,
      exclude_kqd_from_tt_snapshot: item.exclude_kqd_from_tt_snapshot ?? null,
    },
    defects: snapshotDefects,
    deductions: snapshotDeductions,
    machineLines,
  });

  await query(
    connection,
    `INSERT INTO production_report_snapshots
      (report_id,snapshot_type,standard_version_id,calculation_version,snapshot_data,created_by)
     VALUES(?,'approved',?,'v1',?,?)
     ON DUPLICATE KEY UPDATE
       snapshot_data=VALUES(snapshot_data),
       standard_version_id=VALUES(standard_version_id),
       created_by=VALUES(created_by),
       created_at=CURRENT_TIMESTAMP`,
    [approvedReportId, item.standard_version_id || null, snapshotData, reviewerId],
  );
}

module.exports = {
  async approveSelected(targets, reviewerId, isAdmin = false) {
    assertReviewBatchSize(targets);
    const normalizedTargets = Array.isArray(targets)
      ? targets.map((item) => typeof item === "object" ? item : { id: item, expected_updated_at: null })
      : [];
    const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));
    if (!reportIds.length) throw new Error("Danh sách báo cáo không hợp lệ");
    const expectedById = new Map(normalizedTargets.map((item) => [Number(item.id), item.expected_updated_at || null]));
    const connection = await getConnection();
    const postCommitNotifications = [];
    const approvedIds = [];
    const dates = new Set();

    try {
      await beginTransaction(connection);
      const placeholders = reportIds.map(() => "?").join(",");
      const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id = temp.process_id";
      const scopeWhere = isAdmin ? "" : "AND mp.manager_id = ?";
      const params = isAdmin ? reportIds : [...reportIds, reviewerId];
      const rows = await query(
        connection,
        `SELECT DISTINCT temp.*, w.user_id AS worker_user_id
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
        const error = new Error(
          "Danh sách báo cáo đã thay đổi hoặc có báo cáo không còn trong phạm vi phê duyệt. Hãy tải lại danh sách rồi chọn lại."
        );
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

      const lockedReportingPeriods = await loadLockedReportingPeriods(connection, rows);
      const standardResolver = createStandardResolver({
        query: (sql, params = []) => qRows(connection, sql, params),
      });

      for (const item of rows) {
        assertReportingPeriodUnlocked(item, lockedReportingPeriods);
        await validateApprovalSnapshot(item, connection, standardResolver);

        const insertResult = await query(
          connection,
          `INSERT INTO production_reports
           (source_temp_id,worker_id,process_id,work_date,entry_date,shift,operation_type,operation_mode,machine_no,
            product_name,total_time,actual_time,deduction_time,standard_output,standard_version_id,machine_standard_id,
            training_percent_snapshot,exclude_kqd_from_tt_snapshot,actual_output,tt_ok,tt_ng,kqd_dap_lai,kqd_tuot,
            vo_do_long,xuoc_do_long,cong_gay,xoay,khong_dut,bavia_hut,ppcm,loi_cao_su,ng_kich_thuoc,cat_lem,note,
            extra_data,status,review_note,reviewed_by,approved_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())`,
          [
            item.id,item.worker_id,item.process_id,item.work_date,item.entry_date || item.work_date,item.shift,
            item.operation_type ?? null,item.operation_mode ?? null,item.machine_no,item.product_name,
            item.total_time,item.actual_time,item.deduction_time,item.standard_output,item.standard_version_id || null,
            item.machine_standard_id || null,item.training_percent_snapshot ?? null,item.exclude_kqd_from_tt_snapshot ?? null,
            item.actual_output,item.tt_ok,item.tt_ng,item.kqd_dap_lai,item.kqd_tuot,item.vo_do_long,item.xuoc_do_long,
            item.cong_gay,item.xoay,item.khong_dut,item.bavia_hut,item.ppcm,item.loi_cao_su,item.ng_kich_thuoc,
            item.cat_lem,item.note,serializeExtraData(item.extra_data),"approved",item.review_note,reviewerId,
          ],
        );
        const approvedReportId = Number(insertResult.insertId);
        approvedIds.push(approvedReportId);

        const workDate = item.work_date instanceof Date
          ? `${item.work_date.getFullYear()}-${String(item.work_date.getMonth()+1).padStart(2,"0")}-${String(item.work_date.getDate()).padStart(2,"0")}`
          : String(item.work_date).slice(0,10);
        dates.add(workDate);

        await query(
          connection,
          `INSERT INTO production_report_defects (report_id,defect_type_id,quantity)
           SELECT ?,defect_type_id,quantity FROM production_temp_defects WHERE temp_report_id=?`,
          [approvedReportId,item.id],
        );
        await query(
          connection,
          `INSERT INTO production_report_deductions (report_id,deduction_type_id,hours)
           SELECT ?,deduction_type_id,hours FROM production_temp_deductions WHERE temp_report_id=?`,
          [approvedReportId,item.id],
        );
        await copyMachineLinesToApproved(item.id, approvedReportId, connection);
        await createLegacyApprovedSnapshot(item, approvedReportId, reviewerId, connection);
        await createApprovedReportVersion(
          {
            reportId: approvedReportId,
            reason: `Tạo từ báo cáo tạm #${item.id}`,
            userId: reviewerId,
          },
          connection,
        );

        await AuditService.logActivity({
          userId: reviewerId,
          action: "REPORT_APPROVED",
          entityType: "temp_report",
          entityId: item.id,
          description: `Duyệt báo cáo thành công #${approvedReportId}`,
          metadata: { approved_report_id: approvedReportId },
        }, connection);
        await AuditService.logActivity({
          userId: reviewerId,
          action: "REPORT_CREATED",
          entityType: "approved_report",
          entityId: approvedReportId,
          description: `Tạo báo cáo đã duyệt từ #${item.id}`,
          metadata: { temp_report_id: item.id },
        }, connection);
        await AuditService.logActivity({
          userId:reviewerId,
          action:"REPORT_APPROVED",
          entityType:"approved_report",
          entityId:approvedReportId,
          description:`Duyệt báo cáo #${item.id} thành báo cáo đã duyệt #${approvedReportId}`,
          metadata:{temp_report_id:item.id,approved_report_id:approvedReportId,worker_id:item.worker_id,process_id:item.process_id,work_date:item.work_date,shift:item.shift},
        }, connection);

        await query(
          connection,
          `UPDATE production_reports_temp
              SET status='approved',reviewed_by=?,approved_at=NOW(),updated_at=NOW()
            WHERE id=?`,
          [reviewerId,item.id],
        );

        const approvedTempSnapshot = await AuditService.loadTempReportSnapshot(item.id, connection);
        if (approvedTempSnapshot) {
          await AuditService.createReportVersion({
            reportType:"temp",
            reportId:item.id,
            snapshot:approvedTempSnapshot,
            reason:`Được duyệt thành báo cáo chính thức #${approvedReportId}`,
            userId:reviewerId,
          }, connection);
        }

        postCommitNotifications.push({
          userIds:[item.worker_user_id],
          payload:{
            type:"report_approved",
            title:"Báo cáo đã được duyệt",
            message:`Báo cáo ngày ${workDate}, ca ${item.shift || "-"}, sản phẩm ${item.product_name || "-"} đã được duyệt.`,
            linkUrl:`/worker/history/${approvedReportId}?source=approved`,
            entityType:"approved_report",
            entityId:approvedReportId,
          },
        });
      }

      await commit(connection);
      for (const notification of postCommitNotifications) {
        try {
          await AuditService.notifyUsers(notification.userIds, notification.payload);
        } catch (error) {
          console.warn(`[KTC] Post-commit approval notification failed: ${error.message}`);
        }
      }
      return {
        count: rows.length,
        temp_ids: rows.map((row) => row.id),
        approved_ids: approvedIds,
        dates: [...dates],
      };
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  },

  async rejectSelected(targets, reviewerId, reason, isAdmin = false) {
    assertReviewBatchSize(targets);
    const normalizedTargets = Array.isArray(targets)
      ? targets.map((item) => typeof item === "object" ? item : { id:item, expected_updated_at:null })
      : [];
    const reportIds = normalizeIds(normalizedTargets.map((item) => item.id));
    const expectedById = new Map(normalizedTargets.map((item) => [Number(item.id), item.expected_updated_at || null]));
    const cleanReason = String(reason || "").trim();
    if (!reportIds.length) throw new Error("Danh sách báo cáo không hợp lệ");
    if (!cleanReason) throw new Error("Vui lòng nhập lý do từ chối");

    const connection = await getConnection();
    const postCommitNotifications = [];
    try {
      await beginTransaction(connection);
      const placeholders = reportIds.map(() => "?").join(",");
      const scopeJoin = isAdmin ? "" : "JOIN manager_processes mp ON mp.process_id=temp.process_id";
      const scopeWhere = isAdmin ? "" : "AND mp.manager_id=?";
      const params = isAdmin ? [...reportIds] : [...reportIds,reviewerId];
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
        const error = new Error(
          "Danh sách báo cáo đã thay đổi hoặc có báo cáo không còn trong phạm vi phê duyệt. Hãy tải lại danh sách rồi chọn lại."
        );
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
          [cleanReason,reviewerId,row.id],
        );
        const rejectedSnapshot = await AuditService.loadTempReportSnapshot(row.id, connection);
        if (rejectedSnapshot) {
          await AuditService.createReportVersion({
            reportType:"temp",reportId:row.id,snapshot:rejectedSnapshot,
            reason:`Bị từ chối: ${cleanReason}`,userId:reviewerId,
          },connection);
        }
        await AuditService.logActivity({
          userId: reviewerId,
          action: "REPORT_REJECTED",
          entityType: "temp_report",
          entityId: row.id,
          description: `Từ chối báo cáo #${row.id}: ${cleanReason}`,
          metadata: { reason: cleanReason, worker_id: row.worker_id, process_id: row.process_id },
        }, connection);
        await AuditService.logActivity({
          userId:reviewerId,action:"REPORT_REJECTED",entityType:"temp_report",entityId:row.id,
          description:`Từ chối báo cáo #${row.id}: ${cleanReason}`,
          metadata:{reason:cleanReason,worker_id:row.worker_id,process_id:row.process_id},
        },connection);
        postCommitNotifications.push({
          userIds:[row.worker_user_id],
          payload:{
            type:"report_rejected",title:"Báo cáo đã bị từ chối",
            message:`Báo cáo ngày ${String(row.work_date).slice(0,10)}, ca ${row.shift || "-"} bị từ chối: ${cleanReason}`,
            linkUrl:`/worker/history/${row.id}?source=pending`,entityType:"temp_report",entityId:row.id,
          },
        });
      }
      await commit(connection);
      for (const notification of postCommitNotifications) {
        try { await AuditService.notifyUsers(notification.userIds,notification.payload); }
        catch (error) { console.warn(`[KTC] Post-commit rejection notification failed: ${error.message}`); }
      }
      return {count:rows.length,ids:rows.map((row)=>row.id)};
    } catch (error) {
      await rollback(connection);
      throw error;
    } finally {
      connection.release();
    }
  },
};
