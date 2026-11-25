'use strict';
const db = require('../config/db');
const AuditService = require('./auditService');
const { hasPermission } = require('./permissionService');
const { assertProcessScope } = require('./processAuthorizationService');
const { replaceApprovedChildrenFromSnapshot } = require('../repositories/approvedReportRestoreRepository');
const { createApprovedReportVersion, parseSnapshotJson, loadApprovedAggregateSnapshot, validateApprovedVersionSnapshot, assertApprovedVersionSnapshotSafe, approvedSnapshotsEqual, REPORT_FIELDS } = require('./approvedVersionSnapshotService');
const { timestampsEqual, httpError } = require('./approvedReportEditVersionPolicy');

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

async function restoreApprovedReportVersion({ reportId, versionNo, reason, userId, actor, req = null, expectedUpdatedAt = null }) {
  if (!(await hasPermission(actor, 'REPORT_APPROVED_EDIT'))) {
    throw httpError(403, 'PERMISSION_DENIED', 'Bạn không có quyền khôi phục báo cáo đã duyệt');
  }
  const id = Number(reportId);
  const version = Number(versionNo);
  if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt.trim() || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw httpError(428, 'REPORT_VERSION_TOKEN_REQUIRED', 'Vui lòng tải lại lịch sử trước khi khôi phục');
  }
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
      `UPDATE production_reports SET ${parentFields.map((field) => `${field}=?`).join(',')}, updated_at=GREATEST(NOW(6), DATE_ADD(COALESCE(updated_at, NOW(6)), INTERVAL 1000 MICROSECOND)) WHERE id=?`,
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



module.exports = { restoreApprovedReportVersion, normalizeVersionSnapshot, validateRestoreEventLinks };
