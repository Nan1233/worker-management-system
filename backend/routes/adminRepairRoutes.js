const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const { repairApprovedReportDetails } = require('../services/repairApprovedReportDetailsService');

const router = express.Router();

// One-off production repair. Admin only; defaults to dry-run so a request cannot mutate data accidentally.
router.post('/approved-report-details', authMiddleware, checkRole('admin'), permission('REPORT_APPROVE'), async (req, res) => {
  try {
    const body = req.body || {};
    const execute = body.execute === true || String(body.execute || '').toLowerCase() === 'true';
    const result = await repairApprovedReportDetails({
      dateFrom: body.date_from,
      dateTo: body.date_to,
      limit: body.limit,
      execute,
    });
    return res.json({
      success: true,
      message: execute ? 'Đã repair chi tiết báo cáo đã duyệt' : 'Dry-run: chưa thay đổi dữ liệu',
      data: result,
    });
  } catch (error) {
    console.error('REPAIR APPROVED REPORT DETAILS ERROR:', error);
    return res.status(error.status || 500).json({
      success: false,
      code: error.code || 'REPAIR_APPROVED_REPORT_DETAILS_FAILED',
      message: error.isPublic ? error.message : 'Không thể repair chi tiết báo cáo đã duyệt',
    });
  }
});

module.exports = router;
