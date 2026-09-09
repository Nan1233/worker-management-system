const db = require("../config/db");
const AuditService = require("../services/auditService");
const { query, getConnection, beginTransaction, commit, rollback } = require("./productionTempModelShared");
const createModel = require("./productionTempCreateModel");
const { resolveInitialTrainingSnapshot } = require("../services/trainingSnapshotService");
const { buildLogicalDuplicateKey, normalizeNonProductWorkType } = require("../services/logicalDuplicateReportService");
const { verifyDuplicateConfirmation } = require("../services/duplicateConfirmationService");

const PROCESS_CODE = "CVK";
const PROCESS_ID = 60006;
const ALLOWED_WORK_TYPES = new Set([
  "XUẤT NHẬP",
  "HỖ TRỢ",
  "KHO",
  "VỆ SINH",
  "CÔNG VIỆC KHÁC",
]);

function normalizeWorkType(value) {
  const normalized = normalizeNonProductWorkType(value).toUpperCase();
  if (normalized === "HỖ TRỢ" || normalized === "HO TRO") return "HỖ TRỢ";
  if (normalized === "KHO") return "KHO";
  if (normalized === "VỆ SINH" || normalized === "VE SINH") return "VỆ SINH";
  if (normalized === "CÔNG VIỆC KHÁC" || normalized === "CONG VIEC KHAC") return "CÔNG VIỆC KHÁC";
  if (normalized === "XUẤT NHẬP" || normalized === "XUAT NHAP") return "XUẤT NHẬP";
  return normalized;
}

function getWorkType(data) {
  return normalizeWorkType(
    data?.work_type ||
    data?.workType ||
    data?.extra_data?.work_type ||
    data?.extra_data?.workType
  );
}

async function findExisting({ workerId, workDate, shift, workType }, executor) {
  const params = [workerId, PROCESS_ID, workDate, shift, workType];
  // Do not read logical_duplicate_key here. CVK duplicate detection is based on
  // worker/date/shift/work_type, and legacy approved databases may not have that
  // optional column yet. Keeping the lookup schema-light lets CVK submissions work
  // before a maintenance migration is applied.
  const tempRows = await query(
    executor,
    `SELECT id, status, work_date, shift, machine_no, product_name, created_at, updated_at,
            'temp' AS report_type
       FROM production_reports_temp
      WHERE worker_id = ?
        AND process_id = ?
        AND work_date = ?
        AND shift = ?
        AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.work_type')), '')) = UPPER(?)
        AND status IN ('pending', 'need_fix')
      ORDER BY id DESC
      LIMIT 1`,
    params
  );
  if (tempRows[0]) return tempRows[0];

  const approvedRows = await query(
    executor,
    `SELECT id, status, work_date, shift, machine_no, product_name, created_at, updated_at,
            'approved' AS report_type
       FROM production_reports
      WHERE worker_id = ?
        AND process_id = ?
        AND work_date = ?
        AND shift = ?
        AND UPPER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(extra_data, '$.work_type')), '')) = UPPER(?)
        AND status <> 'deleted'
      ORDER BY id DESC
      LIMIT 1`,
    params
  );
  return approvedRows[0] || null;
}

async function createCompleteReport(payload = {}) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : payload;
  const defects = Array.isArray(payload?.defects) ? payload.defects : [];
  const deductions = Array.isArray(payload?.deductions) ? payload.deductions : [];
  const audit = payload?.audit && typeof payload.audit === "object" ? payload.audit : {};
  const workerId = Number(data?.worker_id);
  const workType = getWorkType(data);

  if (!Number.isInteger(workerId) || workerId <= 0) {
    const error = new Error("Không xác định được nhân viên");
    error.status = 422;
    error.code = "WORKER_REQUIRED";
    error.isPublic = true;
    throw error;
  }
  if (!ALLOWED_WORK_TYPES.has(workType)) {
    const error = new Error("Loại công việc khác không hợp lệ");
    error.status = 422;
    error.code = "NON_PRODUCT_WORK_TYPE_INVALID";
    error.isPublic = true;
    throw error;
  }

  data.process_id = PROCESS_ID;
  data.process_code = PROCESS_CODE;
  data.worker_id = workerId;
  data.workerId = workerId;
  data.operation_mode = "MANUAL";
  data.operation_type = null;
  data.machine_no = null;
  data.product_name = null;
  data.standard_output = 0;
  data.standard_version_id = null;
  data.machine_standard_id = null;
  data.actual_output = 0;
  data.tt_ok = 0;
  data.tt_ng = 0;
  data.deduction_time = Number(data.deduction_time) || 0;
  data.extra_data = {
    ...(data.extra_data && typeof data.extra_data === "object" ? data.extra_data : {}),
    work_type: workType,
    process_code: PROCESS_CODE,
    non_product_work: true,
  };

  const logicalDuplicateKey = buildLogicalDuplicateKey({
    workerId,
    processId: PROCESS_ID,
    processCode: PROCESS_CODE,
    workDate: data.work_date,
    shift: data.shift,
    operationMode: "MANUAL",
    machineNo: null,
    productName: null,
    workType,
    machineLines: [],
  });
  data.logical_duplicate_key = logicalDuplicateKey;

  const connection = await getConnection();
  try {
    await beginTransaction(connection);

    const clientRequestId = String(data.client_request_id || "").trim();
    if (!clientRequestId) {
      const error = new Error("Thiếu mã yêu cầu gửi báo cáo");
      error.status = 400;
      error.code = "CLIENT_REQUEST_ID_REQUIRED";
      error.isPublic = true;
      throw error;
    }

    // CVK intentionally does not use production_report_duplicate_locks.
    // This process is a high-frequency, no-product form and the old lock-row
    // transaction was the source of TiDB 1205 contention. Idempotency is still
    // checked by worker + client_request_id before inserting.
    const previousRequest = await createModel.findByClientRequest(workerId, clientRequestId, connection);
    if (previousRequest) {
      await commit(connection);
      return { id: Number(previousRequest.id), duplicate: true, duplicate_reason: "request_id", existing_report: previousRequest };
    }

    const existing = await findExisting({
      workerId,
      workDate: data.work_date,
      shift: data.shift,
      workType,
    }, connection);

    if (existing && !data.force_create) {
      const error = new Error("Đã có báo cáo Công việc khác cùng nhân viên, ngày, ca và loại công việc");
      error.status = 409;
      error.code = "DUPLICATE_CONFIRMATION_REQUIRED";
      error.isPublic = true;
      error.existing_report = existing;
      error.details = existing;
      throw error;
    }

    if (existing && data.force_create) {
      const confirmation = verifyDuplicateConfirmation(data.duplicate_confirmation_token, {
        workerId,
        logicalDuplicateKey,
        existingReportId: existing.id,
        existingReportType: existing.report_type || "temp",
      });
      if (!confirmation.valid) {
        const error = new Error("Xác nhận tạo báo cáo trùng không hợp lệ hoặc đã hết hạn");
        error.status = 409;
        error.code = "DUPLICATE_CONFIRMATION_REQUIRED";
        error.isPublic = true;
        error.existing_report = existing;
        error.details = { reason: confirmation.reason, existing };
        throw error;
      }
    } else if (data.force_create) {
      const error = new Error("Không có báo cáo trùng hợp lệ để xác nhận tạo lần thứ hai");
      error.status = 409;
      error.code = "DUPLICATE_CONFIRMATION_REQUIRED";
      error.isPublic = true;
      throw error;
    }

    const trainingSnapshot = await resolveInitialTrainingSnapshot({
      executor: connection,
      workerId,
      processId: PROCESS_ID,
      workDate: data.work_date,
      trainingPercent: data.training_percent,
    });
    data.training_percent_snapshot = trainingSnapshot.training_percent;
    data.exclude_kqd_from_tt_snapshot = null;

    const auditUserId = Number(audit?.userId || 0);
    if (!Number.isInteger(auditUserId) || auditUserId <= 0) {
      const error = new Error("Không xác định được người tạo báo cáo để ghi audit");
      error.code = "REPORT_AUDIT_ACTOR_REQUIRED";
      throw error;
    }

    const tempId = await createModel.create(data, connection);
    await createModel.createDefects(tempId, PROCESS_ID, defects, connection);
    await createModel.createDeductions(tempId, PROCESS_ID, deductions, connection);

    const createdSnapshot = await AuditService.loadTempReportSnapshot(tempId, connection);
    if (createdSnapshot) {
      await AuditService.createReportVersion({
        reportType: "temp",
        reportId: tempId,
        snapshot: createdSnapshot,
        reason: "Tạo báo cáo công việc khác chờ duyệt",
        userId: auditUserId,
      }, connection);
    }

    await createModel.logAction({
      reportType: "temp",
      reportId: tempId,
      userId: auditUserId,
      action: "CREATE",
      note: audit.note || `Công nhân tạo báo cáo ${workType}`,
      ipAddress: audit.ipAddress || null,
      userAgent: audit.userAgent || null,
    }, connection);

    await query(
      connection,
      `INSERT INTO activity_logs
       (user_id, action, entity_type, entity_id, description, metadata_json, ip_address, user_agent)
       VALUES (?, 'CREATE_REPORT', 'temp_report', ?, ?, ?, ?, ?)`,
      [
        auditUserId,
        String(tempId),
        `Công nhân tạo báo cáo ${workType} chờ duyệt`,
        JSON.stringify({ processId: PROCESS_ID, processCode: PROCESS_CODE, workDate: data.work_date, shift: data.shift, workType, clientRequestId, logicalDuplicateKey }),
        audit.ipAddress || null,
        audit.userAgent || null,
      ]
    );

    await commit(connection);
    return { id: Number(tempId), duplicate: false, duplicate_reason: null, existing_report: null, logical_duplicate_key: logicalDuplicateKey };
  } catch (error) {
    await rollback(connection);
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createCompleteReport, normalizeWorkType, ALLOWED_WORK_TYPES };
