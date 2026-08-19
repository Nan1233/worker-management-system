const db = require('../config/db');
const AuditService = require('./auditService');
const { validateProductionReport } = require('../utils/reportValidation');
const { validateMasterData } = require('./reportBusinessValidationService');
const ReportGovernanceService = require('./reportGovernanceService');
const { recalculateReportOutput } = require('./kqdReportCalculationService');
const { assertProcessScope } = require('./processAuthorizationService');
const {
  createApprovedReportVersion,
  parseSnapshotJson,
  loadApprovedAggregateSnapshot,
  validateApprovedVersionSnapshot,
  assertApprovedVersionSnapshotSafe,
  approvedSnapshotsEqual,
  REPORT_FIELDS,
  MACHINE_LINE_FIELDS
} = require('./approvedVersionSnapshotService');

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

async function updateApprovedReport({ reportId, patch, reason, userId, actor, req = null, expectedUpdatedAt = null, source = 'web', sourceMeta = null }) {
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
    await assertProcessScope(actor, lockedRows[0].process_id, { executor: connection, action: source === 'excel' ? 'REPORT_APPROVED_EDIT_EXCEL' : 'REPORT_APPROVED_EDIT' });

    const before = await loadApprovedSnapshot(Number(reportId), connection);
    if (expectedUpdatedAt && !timestampsEqual(expectedUpdatedAt, before.updated_at || before.created_at)) {
      const conflictMessage = source === 'excel'
        ? 'Báo cáo đã thay đổi sau khi file Excel được tạo. Hãy đồng bộ Excel mới rồi sửa lại.'
        : 'Báo cáo đã được người khác cập nhật. Vui lòng tải lại dữ liệu trước khi lưu.';
      throw httpError(409, 'REPORT_VERSION_CONFLICT', conflictMessage, {
        expected_updated_at: expectedUpdatedAt,
        current_updated_at: before.updated_at || before.created_at || null
      });
    }

    if (await ReportGovernanceService.isPeriodLocked(before.work_date, before.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Kỳ báo cáo đã khóa, không thể chỉnh sửa dữ liệu');
    }

    const inputPatch = patch && typeof patch === 'object' ? patch : {};
    if (Object.prototype.hasOwnProperty.call(inputPatch, 'process_id') && Number(inputPatch.process_id) !== Number(before.process_id)) {
      throw httpError(422, 'PROCESS_CHANGE_NOT_SUPPORTED', 'Không hỗ trợ chuyển báo cáo đã duyệt sang công đoạn khác');
    }
    const isMachineReport = String(before.operation_mode || '').toUpperCase() === 'MACHINE';
    const aggregateKeys = ['standard_output', 'actual_output', 'tt_ok', 'tt_ng', 'machine_no', 'product_name', 'defects', 'deductions', 'total_time', 'actual_time', 'deduction_time'];
    if (isMachineReport && aggregateKeys.some((key) => Object.prototype.hasOwnProperty.call(inputPatch, key))) {
      throw httpError(422, 'MACHINE_AGGREGATE_READ_ONLY', 'Báo cáo Máy chỉ cho phép sửa % học việc và ghi chú trong Excel; dữ liệu máy phải sửa từ màn hình báo cáo chi tiết.');
    }

    const normalizedPatch = { ...inputPatch };
    delete normalizedPatch.standard_output;
    delete normalizedPatch.standard_version_id;
    delete normalizedPatch.machine_standard_id;
    delete normalizedPatch.exclude_kqd_from_tt_snapshot;
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

    }

    const payload = {
      ...before,
      ...normalizedPatch,
      defects: normalizedPatch.defects ?? before.defects,
      deductions: normalizedPatch.deductions ?? before.deductions
    };
    const validation = validateProductionReport(payload, { enforceBackDate: false, skipActualOutputFormula: true });
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
      deductions: validation.normalized.deductions,
      workDate: validation.normalized.work_date
    });
    if (!master.valid) throw httpError(422, 'MASTER_DATA_INVALID', 'Dữ liệu danh mục không hợp lệ', master.errors);

    const authorityChanged = ['product_name','machine_no','work_date'].some((key) => Object.prototype.hasOwnProperty.call(inputPatch, key));
    validation.normalized.standard_output = authorityChanged ? Number(master.standardOutput) : Number(before.standard_output);
    validation.normalized.standard_version_id = authorityChanged ? master.standardVersionId : (before.standard_version_id || null);
    validation.normalized.machine_standard_id = authorityChanged ? master.machineStandardId : (before.machine_standard_id || null);
    const policySnapshot = authorityChanged
      ? (Number(master.excludeKqdFromTt || 0) === 1 ? 1 : 0)
      : before.exclude_kqd_from_tt_snapshot;
    const needsKqdRecalculation = !isMachineReport && (
      Array.isArray(normalizedPatch.defects)
      || Object.prototype.hasOwnProperty.call(normalizedPatch, 'tt_ok')
      || authorityChanged
    );
    if (needsKqdRecalculation && (policySnapshot === null || policySnapshot === undefined || String(policySnapshot).trim() === '')) {
      throw httpError(422, 'KQD_POLICY_SNAPSHOT_MISSING', 'Báo cáo cũ chưa có snapshot chính sách KQD; cần audit trước khi chỉnh dữ liệu sản lượng');
    }
    validation.normalized.exclude_kqd_from_tt_snapshot = policySnapshot === null || policySnapshot === undefined || String(policySnapshot).trim() === ''
      ? null
      : (Number(policySnapshot) === 1 ? 1 : 0);
    if (needsKqdRecalculation) {
      const output = recalculateReportOutput({
        ttOk: validation.normalized.tt_ok,
        defects: master.authoritativeDefects,
        excludeKqdFromTtSnapshot: validation.normalized.exclude_kqd_from_tt_snapshot
      });
      validation.normalized.tt_ok = output.ttOk;
      validation.normalized.tt_ng = output.totalNg;
      validation.normalized.actual_output = output.actualOutput;
    }

    const allowed = ['machine_no','product_name','note','shift','work_date','operation_type','operation_mode','total_time','actual_time','deduction_time','standard_output','standard_version_id','machine_standard_id','exclude_kqd_from_tt_snapshot','actual_output','tt_ok','tt_ng'];
    await createApprovedReportVersion({ reportId: Number(reportId), reason: changeReason, userId }, connection);
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
    const versionNo = await createApprovedReportVersion({ reportId: Number(reportId), reason: changeReason, userId }, connection);
    const trackedKeys = ['work_date','shift','operation_type','operation_mode','machine_no','product_name','training_percent_snapshot','exclude_kqd_from_tt_snapshot','actual_time','total_time','deduction_time','actual_output','tt_ok','tt_ng','note'];
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

function normalizeDateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dbJson(value) {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function restoreConflict(expectedUpdatedAt, current) {
  return httpError(409, 'REPORT_VERSION_CONFLICT', 'Báo cáo đã thay đổi sau khi màn hình lịch sử được mở. Hãy tải lại lịch sử trước khi khôi phục.', {
    expected_updated_at: expectedUpdatedAt,
    current_updated_at: current?.updated_at || current?.created_at || null
  });
}

function unsafeSnapshotError(validation) {
  const structural = validation?.issues?.some((issue) => issue.code === 'ROLLBACK_SNAPSHOT_INVALID' || issue.code === 'ROLLBACK_UNSUPPORTED_SCHEMA_VERSION');
  return httpError(
    422,
    structural ? 'ROLLBACK_SNAPSHOT_INVALID' : 'ROLLBACK_VERSION_UNSAFE',
    structural ? 'Snapshot phiên bản không hợp lệ' : 'Phiên bản báo cáo chưa đủ dữ liệu lịch sử để khôi phục an toàn',
    validation?.issues || []
  );
}

async function validateRestoreEventLinks({ snapshot, executor }) {
  const report = snapshot.report;
  const eventIds = [...new Set(snapshot.machineLines
    .map((entry) => Number(entry?.line?.machine_event_id || 0))
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!eventIds.length) return true;

  for (const eventId of eventIds) {
    const [rows] = await executor.query(
      `SELECT id,process_id,machine_id,machine_code,product_code,work_date,shift,status
         FROM machine_production_events
        WHERE id=? LIMIT 1`,
      [eventId]
    );
    const event = rows[0];
    if (!event || String(event.status || '').toLowerCase() !== 'approved') {
      throw httpError(422, 'ROLLBACK_EVENT_LINK_INVALID', `Production event #${eventId} không tồn tại hoặc chưa approved`);
    }
    for (const entry of snapshot.machineLines.filter((item) => Number(item?.line?.machine_event_id) === eventId)) {
      const line = entry.line;
      const same = Number(event.process_id) === Number(report.process_id)
        && Number(event.machine_id) === Number(line.machine_id)
        && String(event.machine_code || '') === String(line.machine_code || '')
        && String(event.product_code || '') === String(line.product_code || '')
        && normalizeDateValue(event.work_date) === normalizeDateValue(report.work_date)
        && String(event.shift || '') === String(report.shift || '');
      if (!same) {
        throw httpError(422, 'ROLLBACK_EVENT_LINK_INVALID', `Production event #${eventId} không khớp process/machine/product/work_date/shift của snapshot`);
      }
    }
  }
  return true;
}

async function replaceApprovedChildrenFromSnapshot({ reportId, snapshot, executor }) {
  const id = Number(reportId);

  await executor.query('DELETE FROM production_report_defects WHERE report_id=?', [id]);
  for (const item of snapshot.defects) {
    await executor.query(
      'INSERT INTO production_report_defects(report_id,defect_type_id,quantity) VALUES(?,?,?)',
      [id, Number(item.defect_type_id), item.quantity]
    );
  }

  await executor.query('DELETE FROM production_report_deductions WHERE report_id=?', [id]);
  for (const item of snapshot.deductions) {
    await executor.query(
      'INSERT INTO production_report_deductions(report_id,deduction_type_id,hours) VALUES(?,?,?)',
      [id, Number(item.deduction_type_id), item.hours]
    );
  }

  await executor.query(
    `DELETE md FROM production_report_machine_defects md
      INNER JOIN production_report_machine_lines ml ON ml.id=md.machine_line_id
      WHERE ml.report_id=?`,
    [id]
  );
  await executor.query('DELETE FROM production_report_machine_lines WHERE report_id=?', [id]);

  const insertColumns = MACHINE_LINE_FIELDS;
  for (const entry of snapshot.machineLines) {
    const line = entry.line;
    const values = insertColumns.map((field) => {
      if (field === 'deductions_json' || field === 'defects_json') return dbJson(line[field]);
      return line[field] ?? null;
    });
    const [insertResult] = await executor.query(
      `INSERT INTO production_report_machine_lines(report_id,${insertColumns.join(',')})
       VALUES(${['?', ...insertColumns.map(() => '?')].join(',')})`,
      [id, ...values]
    );
    const newLineId = Number(insertResult.insertId);
    if (!Number.isInteger(newLineId) || newLineId <= 0) {
      throw httpError(500, 'ROLLBACK_MACHINE_LINE_INSERT_FAILED', 'Không lấy được ID dòng máy sau khi khôi phục');
    }
    for (const defect of entry.defects) {
      await executor.query(
        `INSERT INTO production_report_machine_defects
          (machine_line_id,defect_type_id,defect_code,defect_name,quantity)
         VALUES(?,?,?,?,?)`,
        [newLineId, defect.defect_type_id ?? null, String(defect.defect_code), defect.defect_name ?? null, defect.quantity]
      );
    }
  }
}

async function restoreApprovedReportVersion({ reportId, versionNo, reason, userId, actor, req = null, expectedUpdatedAt = null }) {
  const id = Number(reportId);
  const version = Number(versionNo);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(version) || version <= 0) {
    throw httpError(422, 'INVALID_REPORT_VERSION', 'Phiên bản báo cáo không hợp lệ');
  }
  const changeReason = String(reason || '').trim().slice(0, 500);
  if (!changeReason) throw httpError(422, 'CHANGE_REASON_REQUIRED', 'Vui lòng nhập lý do khôi phục phiên bản');

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();
    await AuditService.ensureSchema();

    const [currentRows] = await connection.query('SELECT * FROM production_reports WHERE id=? FOR UPDATE', [id]);
    const currentRow = currentRows[0];
    if (!currentRow) throw httpError(404, 'REPORT_NOT_FOUND', 'Không tìm thấy báo cáo');

    await assertProcessScope(actor, currentRow.process_id, { executor: connection, action: 'REPORT_VERSION_RESTORE' });
    if (expectedUpdatedAt && !timestampsEqual(expectedUpdatedAt, currentRow.updated_at || currentRow.created_at)) {
      throw restoreConflict(expectedUpdatedAt, currentRow);
    }

    const [versionRows] = await connection.query(
      `SELECT snapshot_json
         FROM report_versions
        WHERE report_type='approved' AND report_id=? AND version_no=?
        LIMIT 1`,
      [id, version]
    );
    if (!versionRows[0]) throw httpError(404, 'REPORT_VERSION_NOT_FOUND', 'Không tìm thấy phiên bản cần khôi phục');

    const target = parseSnapshotJson(versionRows[0].snapshot_json);
    const validation = validateApprovedVersionSnapshot(target);
    if (!validation.valid) throw unsafeSnapshotError(validation);
    assertApprovedVersionSnapshotSafe(target);

    if (Number(target.report.id) !== id) {
      throw httpError(422, 'ROLLBACK_SNAPSHOT_INVALID', 'Snapshot không thuộc report hiện tại');
    }
    if (Number(target.report.process_id) !== Number(currentRow.process_id)) {
      await assertProcessScope(actor, target.report.process_id, { executor: connection, action: 'REPORT_VERSION_RESTORE_TARGET' });
      throw httpError(422, 'PROCESS_CHANGE_NOT_SUPPORTED', 'Không hỗ trợ đổi công đoạn qua khôi phục phiên bản');
    }

    const current = await loadApprovedAggregateSnapshot({ reportId: id, executor: connection });
    if (!current) throw httpError(404, 'REPORT_NOT_FOUND', 'Không tìm thấy aggregate báo cáo hiện tại');

    if (await ReportGovernanceService.isPeriodLocked(currentRow.work_date, currentRow.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Kỳ báo cáo hiện tại đã khóa, không thể khôi phục');
    }
    if (await ReportGovernanceService.isPeriodLocked(target.report.work_date, target.report.process_id, connection)) {
      throw httpError(423, 'REPORTING_PERIOD_LOCKED', 'Phiên bản cần khôi phục thuộc kỳ đã khóa');
    }

    // Validate every F05 reference before any destructive child replacement.
    await validateRestoreEventLinks({ snapshot: target, executor: connection });

    const preRestoreVersion = await createApprovedReportVersion({
      reportId: id,
      reason: `Trước khi khôi phục V${version}: ${changeReason}`,
      userId
    }, connection);

    const parentFields = REPORT_FIELDS.filter((field) => !['id'].includes(field));
    const parentValues = parentFields.map((field) => {
      if (field === 'extra_data') return dbJson(target.report[field]);
      return target.report[field] ?? null;
    });
    await connection.query(
      `UPDATE production_reports SET ${parentFields.map((field) => `${field}=?`).join(',')}, updated_at=NOW() WHERE id=?`,
      [...parentValues, id]
    );

    await replaceApprovedChildrenFromSnapshot({ reportId: id, snapshot: target, executor: connection });

    const after = await loadApprovedAggregateSnapshot({ reportId: id, executor: connection });
    const afterValidation = validateApprovedVersionSnapshot(after);
    if (!afterValidation.valid) {
      throw httpError(422, 'ROLLBACK_RESTORE_MISMATCH', 'Aggregate sau khôi phục không còn là snapshot v2 hợp lệ', afterValidation.issues);
    }
    if (!approvedSnapshotsEqual(target, after)) {
      throw httpError(422, 'ROLLBACK_RESTORE_MISMATCH', 'Aggregate sau khôi phục không khớp phiên bản đích');
    }

    const newVersion = await createApprovedReportVersion({
      reportId: id,
      reason: `Khôi phục từ V${version}: ${changeReason}`,
      userId
    }, connection);

    await AuditService.logActivity({
      userId,
      action: 'REPORT_RESTORED',
      entityType: 'approved_report',
      entityId: id,
      description: `Khôi phục toàn bộ aggregate báo cáo #${id} từ phiên bản ${version} thành phiên bản ${newVersion}`,
      metadata: {
        restored_from_version: version,
        pre_restore_version: preRestoreVersion,
        new_version: newVersion,
        reason: changeReason,
        work_date: normalizeDateValue(target.report.work_date)
      },
      req
    }, connection);

    await connection.commit();
    return {
      report: after.report,
      aggregate: after,
      version: newVersion,
      pre_restore_version: preRestoreVersion,
      restored_from_version: version,
      before: current.report,
      beforeAggregate: current
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { updateApprovedReport, loadApprovedSnapshot, restoreApprovedReportVersion, normalizeVersionSnapshot, validateRestoreEventLinks, replaceApprovedChildrenFromSnapshot };
