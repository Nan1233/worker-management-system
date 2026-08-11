const db = require('../config/db');
const AuditService = require('./auditService');
const { validateProductionReport } = require('../utils/reportValidation');
const { validateMasterData } = require('./reportBusinessValidationService');
const ReportGovernanceService = require('./reportGovernanceService');
const { calculateActualOutput } = require('../utils/outputCalculation');

function query(executor, sql, params) {
  return executor.promise ? executor.promise().query(sql, params) : executor.query(sql, params);
}

async function loadApprovedSnapshot(reportId, executor = db) {
  const [[reports], [defects], [deductions]] = await Promise.all([
    query(executor, 'SELECT * FROM production_reports WHERE id=? LIMIT 1', [reportId]),
    query(executor, 'SELECT * FROM production_report_defects WHERE report_id=? ORDER BY id', [reportId]),
    query(executor, 'SELECT * FROM production_report_deductions WHERE report_id=? ORDER BY id', [reportId])
  ]);
  if (!reports[0]) return null;
  return { ...reports[0], defects, deductions };
}

function timestampsEqual(expected, actual) {
  if (!expected) return true;
  const a = new Date(expected).getTime();
  const b = new Date(actual || 0).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1000;
}

function httpError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

async function updateApprovedReport({ reportId, patch, reason, userId, req = null, expectedUpdatedAt = null, source = 'web', sourceMeta = null }) {
  if (!Number.isInteger(Number(reportId)) || Number(reportId) <= 0) {
    throw httpError(422, 'INVALID_REPORT_ID', 'ID báo cáo không hợp lệ');
  }
  const changeReason = String(reason || '').trim().slice(0, 500);
  if (!changeReason) throw httpError(422, 'CHANGE_REASON_REQUIRED', 'Vui lòng nhập lý do chỉnh sửa báo cáo đã duyệt');

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    const [lockedRows] = await connection.query('SELECT * FROM production_reports WHERE id=? FOR UPDATE', [Number(reportId)]);
    if (!lockedRows[0]) throw httpError(404, 'REPORT_NOT_FOUND', 'Không tìm thấy báo cáo');

    const before = await loadApprovedSnapshot(Number(reportId), connection);
    if (expectedUpdatedAt && !timestampsEqual(expectedUpdatedAt, before.updated_at || before.created_at)) {
      throw httpError(409, 'REPORT_VERSION_CONFLICT', 'Báo cáo đã thay đổi sau khi file Excel được tạo. Hãy đồng bộ Excel mới rồi sửa lại.', {
        expected_updated_at: expectedUpdatedAt,
        current_updated_at: before.updated_at || before.created_at || null
      });
    }

    if (await ReportGovernanceService.isPeriodLocked(before.work_date, before.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Kỳ báo cáo đã khóa, không thể chỉnh sửa dữ liệu');
    }

    const inputPatch = patch && typeof patch === 'object' ? patch : {};
    const isMachineReport = String(before.operation_mode || '').toUpperCase() === 'MACHINE';
    const aggregateKeys = ['standard_output', 'actual_output', 'tt_ok', 'tt_ng', 'machine_no', 'product_name', 'defects', 'deductions', 'total_time', 'actual_time', 'deduction_time'];
    if (isMachineReport && aggregateKeys.some((key) => Object.prototype.hasOwnProperty.call(inputPatch, key))) {
      throw httpError(422, 'MACHINE_AGGREGATE_READ_ONLY', 'Báo cáo Máy chỉ cho phép sửa % học việc và ghi chú trong Excel; dữ liệu máy phải sửa từ màn hình báo cáo chi tiết.');
    }

    const normalizedPatch = { ...inputPatch };
    if (!isMachineReport) {
      if (Array.isArray(normalizedPatch.deductions)) {
        normalizedPatch.deduction_time = normalizedPatch.deductions.reduce((sum, item) => sum + Number(item?.hours || 0), 0);
      }
      if (Array.isArray(normalizedPatch.defects)) {
        normalizedPatch.tt_ng = normalizedPatch.defects.reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
      }
      const nextActualTime = Object.prototype.hasOwnProperty.call(normalizedPatch, 'actual_time') ? Number(normalizedPatch.actual_time || 0) : Number(before.actual_time || 0);
      const nextDeductionTime = Object.prototype.hasOwnProperty.call(normalizedPatch, 'deduction_time') ? Number(normalizedPatch.deduction_time || 0) : Number(before.deduction_time || 0);
      normalizedPatch.total_time = nextActualTime + nextDeductionTime;
      if (Array.isArray(normalizedPatch.defects) || Object.prototype.hasOwnProperty.call(normalizedPatch, 'tt_ok')) {
        const defectsForOutput = normalizedPatch.defects ?? before.defects;
        normalizedPatch.actual_output = calculateActualOutput({
          ttOk: Object.prototype.hasOwnProperty.call(normalizedPatch, 'tt_ok') ? normalizedPatch.tt_ok : before.tt_ok,
          defects: defectsForOutput,
          excludeKqdFromTt: Boolean(Number(before.exclude_kqd_from_tt || 0))
        });
      }
    }

    const payload = {
      ...before,
      ...normalizedPatch,
      defects: normalizedPatch.defects ?? before.defects,
      deductions: normalizedPatch.deductions ?? before.deductions
    };
    const validation = validateProductionReport(payload, { enforceBackDate: false });
    if (!validation.valid) throw httpError(422, 'REPORT_VALIDATION_FAILED', 'Dữ liệu báo cáo không hợp lệ', validation.errors);

    if (await ReportGovernanceService.isPeriodLocked(validation.normalized.work_date, before.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Ngày báo cáo mới thuộc kỳ đã khóa, không thể chuyển dữ liệu vào kỳ này');
    }

    const master = await validateMasterData({
      workerId: before.worker_id,
      processId: before.process_id,
      machineNo: validation.normalized.machine_no,
      productName: validation.normalized.product_name,
      defects: validation.normalized.defects,
      deductions: validation.normalized.deductions
    });
    if (!master.valid) throw httpError(422, 'MASTER_DATA_INVALID', 'Dữ liệu danh mục không hợp lệ', master.errors);

    const allowed = ['machine_no','product_name','note','shift','work_date','training_percent','total_time','actual_time','deduction_time','standard_output','actual_output','tt_ok','tt_ng'];
    await AuditService.createReportVersion({ reportType: 'approved', reportId: Number(reportId), snapshot: before, reason: changeReason, userId }, connection);
    const values = allowed.map((key) => validation.normalized[key]);
    await connection.query(`UPDATE production_reports SET ${allowed.map((key) => `${key}=?`).join(',')}, updated_by=?, updated_at=NOW() WHERE id=?`, [...values, userId, Number(reportId)]);

    await connection.query('DELETE FROM production_report_defects WHERE report_id=?', [Number(reportId)]);
    for (const item of validation.normalized.defects) {
      await connection.query('INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES(?,?,?)', [Number(reportId), item.defect_type_id, item.quantity]);
    }
    await connection.query('DELETE FROM production_report_deductions WHERE report_id=?', [Number(reportId)]);
    for (const item of validation.normalized.deductions) {
      await connection.query('INSERT INTO production_report_deductions(report_id,deduction_type_id,hours) VALUES(?,?,?)', [Number(reportId), item.deduction_type_id, item.hours]);
    }

    const after = await loadApprovedSnapshot(Number(reportId), connection);
    const versionNo = await AuditService.createReportVersion({ reportType: 'approved', reportId: Number(reportId), snapshot: after, reason: changeReason, userId }, connection);
    const trackedKeys = ['shift','machine_no','product_name','training_percent','actual_time','total_time','deduction_time','actual_output','tt_ok','tt_ng','note'];
    const changedFields = {};
    for (const key of trackedKeys) {
      if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)) {
        changedFields[key] = { before: before?.[key] ?? null, after: after?.[key] ?? null };
      }
    }
    if (JSON.stringify(before?.defects || []) !== JSON.stringify(after?.defects || [])) {
      changedFields.defects = { before: before?.defects || [], after: after?.defects || [] };
    }
    if (JSON.stringify(before?.deductions || []) !== JSON.stringify(after?.deductions || [])) {
      changedFields.deductions = { before: before?.deductions || [], after: after?.deductions || [] };
    }
    await AuditService.logActivity({
      userId,
      action: source === 'excel' ? 'REPORT_UPDATED_FROM_EXCEL' : 'REPORT_UPDATED',
      entityType: 'approved_report',
      entityId: Number(reportId),
      description: `Cập nhật báo cáo phiên bản ${versionNo}${source === 'excel' ? ' từ Excel' : ''}`,
      metadata: { reason: changeReason, source, source_file: sourceMeta?.file || null, source_sheet: sourceMeta?.sheet || null, process_code: sourceMeta?.process_code || null, changed_fields: changedFields },
      req
    }, connection);
    await connection.commit();
    return { report: after, version: versionNo, before };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

function parseSnapshotJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { return null; }
}

function normalizeVersionSnapshot(value) {
  const parsed = parseSnapshotJson(value);
  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.report && typeof parsed.report === 'object') {
    return {
      ...parsed.report,
      product_name: parsed.report.product_name ?? parsed.report.product_code ?? null,
      defects: Array.isArray(parsed.defects) ? parsed.defects : [],
      deductions: Array.isArray(parsed.deductions) ? parsed.deductions : []
    };
  }
  return {
    ...parsed,
    product_name: parsed.product_name ?? parsed.product_code ?? null,
    defects: Array.isArray(parsed.defects) ? parsed.defects : [],
    deductions: Array.isArray(parsed.deductions) ? parsed.deductions : []
  };
}

async function restoreApprovedReportVersion({ reportId, versionNo, reason, userId, req = null }) {
  const id = Number(reportId);
  const version = Number(versionNo);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(version) || version <= 0) {
    throw httpError(422, 'INVALID_REPORT_VERSION', 'Phiên bản báo cáo không hợp lệ');
  }
  const changeReason = String(reason || '').trim().slice(0, 500);
  if (!changeReason) {
    throw httpError(422, 'CHANGE_REASON_REQUIRED', 'Vui lòng nhập lý do khôi phục phiên bản');
  }

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    await AuditService.ensureSchema();

    const [currentRows] = await connection.query(
      'SELECT * FROM production_reports WHERE id=? FOR UPDATE',
      [id]
    );
    if (!currentRows[0]) throw httpError(404, 'REPORT_NOT_FOUND', 'Không tìm thấy báo cáo');

    const [versionRows] = await connection.query(
      `SELECT snapshot_json
       FROM report_versions
       WHERE report_type='approved' AND report_id=? AND version_no=?
       LIMIT 1`,
      [id, version]
    );
    if (!versionRows[0]) throw httpError(404, 'REPORT_VERSION_NOT_FOUND', 'Không tìm thấy phiên bản cần khôi phục');

    const target = normalizeVersionSnapshot(versionRows[0].snapshot_json);
    if (!target) throw httpError(422, 'INVALID_VERSION_SNAPSHOT', 'Dữ liệu phiên bản không hợp lệ');

    const current = await loadApprovedSnapshot(id, connection);
    if (await ReportGovernanceService.isPeriodLocked(current.work_date, current.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Kỳ báo cáo hiện tại đã khóa, không thể khôi phục');
    }

    const targetWorkDate = String(target.work_date || current.work_date).slice(0, 10);
    if (await ReportGovernanceService.isPeriodLocked(targetWorkDate, current.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Phiên bản cần khôi phục thuộc kỳ đã khóa');
    }

    await AuditService.createReportVersion({
      reportType: 'approved', reportId: id, snapshot: current,
      reason: `Trước khi khôi phục V${version}: ${changeReason}`, userId
    }, connection);

    const fields = [
      'machine_no','product_name','note','shift','work_date','training_percent',
      'total_time','actual_time','deduction_time','standard_output','actual_output','tt_ok','tt_ng'
    ];
    const restored = { ...current };
    for (const key of fields) {
      if (Object.prototype.hasOwnProperty.call(target, key)) restored[key] = target[key];
    }
    restored.status = 'approved';

    await connection.query(
      `UPDATE production_reports SET
        machine_no=?, product_name=?, note=?, shift=?, work_date=?, training_percent=?,
        total_time=?, actual_time=?, deduction_time=?, standard_output=?, actual_output=?,
        tt_ok=?, tt_ng=?, status='approved', updated_by=?, updated_at=NOW()
       WHERE id=?`,
      [
        restored.machine_no ?? null,
        restored.product_name ?? current.product_name,
        restored.note ?? null,
        restored.shift ?? current.shift,
        targetWorkDate,
        restored.training_percent ?? current.training_percent ?? 100,
        Number(restored.total_time || 0),
        Number(restored.actual_time || 0),
        Number(restored.deduction_time || 0),
        Number(restored.standard_output || 0),
        Number(restored.actual_output || 0),
        Number(restored.tt_ok || 0),
        Number(restored.tt_ng || 0),
        Number(userId) || null,
        id
      ]
    );

    await connection.query('DELETE FROM production_report_defects WHERE report_id=?', [id]);
    for (const item of target.defects || []) {
      const defectTypeId = Number(item.defect_type_id || item.type_id || 0);
      const quantity = Number(item.quantity || 0);
      if (defectTypeId > 0 && quantity >= 0) {
        await connection.query(
          'INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES(?,?,?)',
          [id, defectTypeId, quantity]
        );
      }
    }

    await connection.query('DELETE FROM production_report_deductions WHERE report_id=?', [id]);
    for (const item of target.deductions || []) {
      const deductionTypeId = Number(item.deduction_type_id || item.type_id || 0);
      const hours = Number(item.hours || 0);
      if (deductionTypeId > 0 && hours >= 0) {
        await connection.query(
          'INSERT INTO production_report_deductions(report_id,deduction_type_id,hours) VALUES(?,?,?)',
          [id, deductionTypeId, hours]
        );
      }
    }

    const after = await loadApprovedSnapshot(id, connection);
    const newVersion = await AuditService.createReportVersion({
      reportType: 'approved', reportId: id, snapshot: after,
      reason: `Khôi phục từ V${version}: ${changeReason}`, userId
    }, connection);

    await AuditService.logActivity({
      userId,
      action: 'REPORT_RESTORED',
      entityType: 'approved_report',
      entityId: id,
      description: `Khôi phục báo cáo #${id} từ phiên bản ${version} thành phiên bản ${newVersion}`,
      metadata: {
        restored_from_version: version,
        new_version: newVersion,
        reason: changeReason,
        work_date: targetWorkDate
      },
      req
    }, connection);

    await connection.commit();
    return { report: after, version: newVersion, restored_from_version: version, before: current };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { updateApprovedReport, loadApprovedSnapshot, restoreApprovedReportVersion, normalizeVersionSnapshot };
