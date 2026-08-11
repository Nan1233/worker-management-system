const { updateApprovedReport } = require('../services/approvedReportEditService');
const { createApprovedReportFromExcel } = require('../services/approvedReportExcelCreateService');
const { envEnabled } = require('../utils/featureFlags');

function cleanPatch(input = {}) {
  const allowed = new Set([
    'machine_no','product_name','note','shift','work_date','operation_type','operation_mode','training_percent','actual_time',
    'tt_ok','defects','deductions'
  ]);
  return Object.fromEntries(Object.entries(input || {}).filter(([key]) => allowed.has(key)));
}

exports.syncExcelEdits = async (req, res) => {
  const changes = Array.isArray(req.body?.changes) ? req.body.changes.slice(0, 200) : [];
  if (!changes.length) return res.status(422).json({ success: false, message: 'Không có thay đổi Excel để đồng bộ' });

  const results = [];
  const affectedDates = new Set();
  for (const change of changes) {
    const id = Number(change?.id);
    try {
      if (change?.create === true) {
        if (change?.invalid) throw Object.assign(new Error(change.error || 'Dòng Excel mới không hợp lệ'), { status: 422, code: 'EXCEL_NEW_ROW_INVALID', isPublic: true });
        const created = await createApprovedReportFromExcel({ data: change?.data || {}, userId: req.user.id, req, sourceMeta: change?.source || null });
        affectedDates.add(String(created.report.work_date).slice(0, 10));
        results.push({ id: created.report.id, create: true, success: true, version: created.version, updated_at: created.report.updated_at || created.report.created_at || null });
        continue;
      }
      const patch = cleanPatch(change?.patch);
      if (!Object.keys(patch).length) {
        results.push({ id, success: true, skipped: true, message: 'Không có cột được phép thay đổi' });
        continue;
      }
      const sourceName = String(change?.source?.file || '').slice(0, 180);
      const reason = `Đồng bộ chỉnh sửa Excel${sourceName ? `: ${sourceName}` : ''}`.slice(0, 500);
      const result = await updateApprovedReport({
        reportId: id,
        patch,
        reason,
        userId: req.user.id,
        req,
        expectedUpdatedAt: change?.expected_updated_at || null,
        source: 'excel',
        sourceMeta: change?.source || null
      });
      affectedDates.add(String(result.before.work_date).slice(0, 10));
      affectedDates.add(String(result.report.work_date).slice(0, 10));
      results.push({ id, success: true, version: result.version, updated_at: result.report.updated_at || null });
    } catch (error) {
      results.push({
        id,
        success: false,
        status: Number(error.status || 500),
        code: error.code || 'EXCEL_SYNC_FAILED',
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
    total: results.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    results
  });
};
