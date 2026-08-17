const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const { expensiveUserLimiter } = require('../middleware/rateLimiters');
const { exportRequestGuard } = require('../middleware/exportRequestGuard');
const validate = require('../middleware/validateRequest');
const companyExcelDataController = require('../controllers/companyExcelDataController');
const desktopExcelExportController = require('../controllers/desktopExcelExportController');
const { anyEnvEnabled } = require('../utils/featureFlags');

const roles = checkRole('admin', 'manager', 'lead');
const canExport = permission('REPORT_EXPORT');
const legacyServerExcelEnabled = () => {
  const requested = anyEnvEnabled([
    'ENABLE_PROCESS_EXCEL_EXPORT',
    'ENABLE_SERVER_COMPANY_EXCEL',
    'ENABLE_SERVER_HEAVY_EXCEL'
  ]);

  if (!requested) return false;

  // Render gói nhỏ không đủ RAM để ExcelJS mở workbook nhiều style.
  // Chỉ cho phép bật lại khi quản trị viên xác nhận rõ bằng biến riêng.
  const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
  const allowOnRender = anyEnvEnabled(['ALLOW_RENDER_HEAVY_EXCEL']);
  return !isRender || allowOnRender;
};

function disabled(req, res) {
  return res.status(503).json({
    success: false,
    code: 'DESKTOP_EXCEL_REQUIRED',
    message: 'Xuất workbook được thực hiện trên ứng dụng Desktop để bảo vệ RAM máy chủ.'
  });
}

function lazyController(modulePath, method) {
  return (req, res, next) => {
    if (!legacyServerExcelEnabled()) return disabled(req, res);
    try {
      return require(modulePath)[method](req, res, next);
    } catch (error) {
      return next(error);
    }
  };
}

router.get('/export-excel/company-status', authMiddleware, roles, canExport, (req, res) => res.json({
  success: true,
  version: 'desktop-monthly-excel',
  mode: 'DESKTOP_JSON_ONLY',
  serverHeavyExcel: false
}));

router.get('/export-excel/company-data', authMiddleware, roles, canExport, companyExcelDataController.get);
router.get('/export-excel/processes', authMiddleware, roles, canExport, desktopExcelExportController.listProcesses);

// Excel POST endpoints are expensive and must not accept duplicate/concurrent requests
// from a single user for the same export target. The guard runs before the rate limiter
// so a UI retry storm becomes a controlled 409 instead of consuming the 429 budget.
router.post('/export-excel', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), lazyController('../controllers/reportExportController', 'exportGiaCongExcel'));
router.post('/export-excel/process', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, processId:{required:true,type:'number'} }), lazyController('../controllers/desktopExcelExportController', 'exportProcess'));
router.get('/export-excel/company-files', authMiddleware, roles, canExport, lazyController('../controllers/desktopExcelExportController', 'listCompanyFiles'));
router.post('/export-excel/company-build-all', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), lazyController('../controllers/desktopExcelExportController', 'buildAllCompanyFiles'));
router.post('/export-excel/company-file', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, groupCode:{required:true,type:'string'} }), lazyController('../controllers/desktopExcelExportController', 'exportCompanyFile'));
router.post('/export-excel/jobs', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, lazyController('../controllers/excelJobController', 'create'));
router.get('/export-excel/jobs', authMiddleware, roles, canExport, lazyController('../controllers/excelJobController', 'list'));
router.get('/export-excel/jobs/:jobId', authMiddleware, roles, canExport, lazyController('../controllers/excelJobController', 'get'));
router.get('/export-excel/jobs/:jobId/download', authMiddleware, roles, canExport, lazyController('../controllers/desktopExcelExportController', 'download'));

module.exports = router;
