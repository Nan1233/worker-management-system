'use strict';
const { hasPermission } = require('../services/permissionService');
const { updateApprovedReport } = require('../services/approvedReportEditService');
const { createApprovedReportFromExcel } = require('../services/approvedReportExcelCreateService');
const { makeExcelSyncReceipt } = require('../services/excelSyncReceiptService');
const { envEnabled } = require('../utils/featureFlags');
const { sanitizeExcelPatch } = require('../../shared/excelSyncContract.cjs');

function publicError(status, code, message) {
  return Object.assign(new Error(message), { status, code, isPublic: true });
}

function normalizeChange(change) {
  if (!change || typeof change !== 'object' || Array.isArray(change)) {
    throw publicError(422, 'EXCEL_SYNC_CHANGE_INVALID', 'Thay đổi Excel không hợp lệ');
  }
  if (typeof change.operation_id !== 'string' || !/^[a-f0-9]{64}$/i.test(change.operation_id)) {
    throw publicError(422, 'EXCEL_SYNC_OPERATION_ID_REQUIRED', 'Thao tác đồng bộ thiếu operation_id hợp lệ');
  }
  if (change.create === true) {
    if (change.invalid) throw publicError(422, 'EXCEL_NEW_ROW_INVALID', String(change.error || 'Dòng Excel mới không hợp lệ'));
    if (!change.data || typeof change.data !== 'object' || Array.isArray(change.data)) {
      throw publicError(422, 'EXCEL_CREATE_DATA_REQUIRED', 'Dòng Excel mới thiếu dữ liệu');
    }
    return { create: true, data: change.data, source: change.source || null };
  }
  const id = Number(change.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw publicError(422, 'INVALID_REPORT_ID', 'ID báo cáo Excel không hợp lệ');
  if (typeof change.expected_updated_at !== 'string' || !change.expected_updated_at.trim()
      || !Number.isFinite(new Date(change.expected_updated_at).getTime())) {
    throw publicError(422, 'EXCEL_EXPECTED_VERSION_REQUIRED', 'Excel thiếu phiên bản gốc hợp lệ; hãy xuất lại file');
  }
  const patch = sanitizeExcelPatch(change.patch);
  if (!Object.keys(patch).length) throw publicError(422, 'EXCEL_PATCH_EMPTY', 'Không có trường hợp lệ để cập nhật');
  return { id, expected_updated_at: change.expected_updated_at, patch, source: change.source || null };
}

exports.syncExcelEdits = async (req, res) => {
  if (!(await hasPermission(req.user, 'EXCEL_DB_SYNC'))) {
    return res.status(403).json({ success: false, code: 'PERMISSION_DENIED', message: 'Bạn không có quyền đồng bộ Excel về DB' });
  }
  if (!Array.isArray(req.body?.changes) || req.body.changes.length === 0 || req.body.changes.length > 200) {
    return res.status(422).json({ success: false, code: 'EXCEL_SYNC_BATCH_SIZE_INVALID', message: 'Mỗi yêu cầu phải có từ 1 đến 200 thay đổi; không cắt bỏ âm thầm' });
  }
  const seenOperations = new Set();
  const results = [];
  const affectedDates = new Set();
  for (const change of req.body.changes) {
    const id = Number(change?.id);
    try {
      const normalized = normalizeChange(change);
      const operationId = change.operation_id.toLowerCase();
      if (seenOperations.has(operationId)) throw publicError(422, 'EXCEL_SYNC_DUPLICATE_OPERATION', 'Một batch chứa hai thao tác có cùng operation_id');
      seenOperations.add(operationId);
      const receipt = makeExcelSyncReceipt({ actorId: req.user.id, operationKey: operationId, canonicalChange: normalized });
      if (normalized.create) {
        const created = await createApprovedReportFromExcel({
          data: normalized.data, userId: req.user.id, actor: req.user, req,
          sourceMeta: normalized.source, excelSyncReceipt: receipt
        });
        if (created.replay) {
          results.push({ ...created.receipt, operation_id: operationId, replay: true });
          continue;
        }
        affectedDates.add(String(created.report.work_date).slice(0, 10));
        results.push({ id: created.report.id, operation_id: operationId, create: true, success: true,
          version: created.version, updated_at: created.report.updated_at || created.report.created_at || null });
        continue;
      }
      const sourceName = String(normalized.source?.file || '').slice(0, 180);
      const reason = `Đồng bộ chỉnh sửa Excel${sourceName ? `: ${sourceName}` : ''}`.slice(0, 500);
      const result = await updateApprovedReport({
        reportId: normalized.id, patch: normalized.patch, reason,
        userId: req.user.id, actor: req.user, req,
        expectedUpdatedAt: normalized.expected_updated_at,
        source: 'excel', sourceMeta: normalized.source, excelSyncReceipt: receipt
      });
      if (result.replay) {
        results.push({ ...result.receipt, operation_id: operationId, replay: true });
        continue;
      }
      affectedDates.add(String(result.before.work_date).slice(0, 10));
      affectedDates.add(String(result.report.work_date).slice(0, 10));
      results.push({ id: normalized.id, operation_id: operationId, success: true,
        version: result.version, updated_at: result.report.updated_at || null });
    } catch (error) {
      results.push({
        id: Number.isSafeInteger(id) && id > 0 ? id : null,
        operation_id: typeof change?.operation_id === 'string' ? change.operation_id : null,
        success: false, status: Number(error.status || 500), code: error.code || 'EXCEL_SYNC_FAILED',
        message: error.isPublic ? error.message : 'Không thể đồng bộ thay đổi Excel',
        errors: error.details || undefined
      });
    }
  }
  if (affectedDates.size && envEnabled('ENABLE_SERVER_HEAVY_EXCEL') && envEnabled('ENABLE_EXCEL_EXPORT_WORKER')) {
    await require('../services/excelExportJobQueue').enqueueMonthlyDates([...affectedDates], req.user?.id).catch(() => {});
  }
  const failed = results.filter((item) => !item.success);
  return res.status(failed.length ? 207 : 200).json({
    success: failed.length === 0,
    partial_success: failed.length > 0 && failed.length < results.length,
    total: results.length, succeeded: results.length - failed.length,
    failed: failed.length, results
  });
};
