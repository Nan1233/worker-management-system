const { updateApprovedReport } = require('../services/approvedReportEditService');
const { envEnabled } = require('../utils/featureFlags');

function cleanPatch(input = {}) {
  const allowed = new Set([
    'machine_no','product_name','note','shift','training_percent','total_time','actual_time',
    'deduction_time','standard_output','actual_output','tt_ok','tt_ng','defects','deductions'
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
