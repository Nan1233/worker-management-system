const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const { expensiveUserLimiter } = require('../middleware/rateLimiters');
const { exportRequestGuard } = require('../middleware/exportRequestGuard');
const validate = require('../middleware/validateRequest');
const companyExcelDataController = require('../controllers/companyExcelDataController');
const cloudflareExcelExportController = require('../controllers/cloudflareExcelExportController');
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

// Node/Render-only controllers must not be statically imported into the
// Cloudflare Worker bundle. Resolve them only when a real Node request needs
// them, using eval(require) so Wrangler does not follow the dependency graph.
function runtimeRequire(modulePath) {
  // eslint-disable-next-line no-eval
  const nodeRequire = eval('require');
  return nodeRequire(modulePath);
}

function desktopController() {
  return runtimeRequire('../controllers/desktopExcelExportController');
}

function legacyController() {
  return runtimeRequire('../controllers/legacyExcelExportCompatController');
}

function isCloudflareWorker() {
  return String(process.env.KTC_CLOUDFLARE_WORKER || '').toLowerCase() === 'true';
}

function isTrustedExcelProxyRequest(req) {
  return String(req.get('X-KTC-Excel-Proxy') || '') === '1';
}

function exportExcelController(req, res, next) {
  // Public Cloudflare request -> proxy to Render.
  // Private Worker -> Render request -> execute Node/ExcelJS locally on Render.
  if (isCloudflareWorker() && !isTrustedExcelProxyRequest(req)) {
    return cloudflareExcelExportController.exportGiaCongExcel(req, res, next);
  }
  res.setHeader('X-KTC-Excel-Backend', 'node-render');
  return legacyController().exportGiaCongExcel(req, res, next);
}

function exportProcessExcelController(req, res, next) {
  if (isCloudflareWorker() && !isTrustedExcelProxyRequest(req)) {
    return cloudflareExcelExportController.exportProcess(req, res, next);
  }
  res.setHeader('X-KTC-Excel-Backend', 'node-render');
  return desktopController().exportProcess(req, res, next);
}

router.get('/export-excel/company-status', authMiddleware, roles, canExport, (req, res) => res.json({
  success: true,
  version: 'desktop-monthly-excel',
  mode: 'DESKTOP_JSON_ONLY',
  serverHeavyExcel: false
}));

router.get('/export-excel/company-data', authMiddleware, roles, canExport, companyExcelDataController.get);
router.get('/export-excel/processes', authMiddleware, roles, canExport, (req, res, next) => {
  try { return desktopController().listProcesses(req, res, next); } catch (error) { return next(error); }
});

// Cloudflare Workers do not render XLSX locally. They proxy the authenticated
// export request to the Node/Render backend, where ExcelJS and the template
// filesystem are available.
router.post('/export-excel', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), exportExcelController);
router.post('/export-excel/process', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, processId:{required:true,type:'number'} }), exportProcessExcelController);

// Kept as explicit Node/Render targets for compatibility with older clients.
// The same proxy marker is accepted by the main endpoints above.
router.post('/export-excel/render-proxy', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), (req, res, next) => {
  try {
    res.setHeader('X-KTC-Excel-Backend', 'node-render');
    return legacyController().exportGiaCongExcel(req, res, next);
  } catch (error) { return next(error); }
});
router.post('/export-excel/process/render-proxy', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, processId:{required:true,type:'number'} }), (req, res, next) => {
  try {
    res.setHeader('X-KTC-Excel-Backend', 'node-render');
    return desktopController().exportProcess(req, res, next);
  } catch (error) { return next(error); }
});

router.get('/export-excel/company-files', authMiddleware, roles, canExport, (req, res, next) => {
  try { return desktopController().listCompanyFiles(req, res, next); } catch (error) { return next(error); }
});
router.post('/export-excel/company-build-all', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), (req, res, next) => {
  if (!legacyServerExcelEnabled()) return disabled(req, res);
  try { return desktopController().buildAllCompanyFiles(req, res, next); } catch (error) { return next(error); }
});
router.post('/export-excel/company-file', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, groupCode:{required:true,type:'string'} }), (req, res, next) => {
  if (!legacyServerExcelEnabled()) return disabled(req, res);
  try { return desktopController().exportCompanyFile(req, res, next); } catch (error) { return next(error); }
});
router.post('/export-excel/jobs', authMiddleware, roles, canExport, exportRequestGuard, expensiveUserLimiter, (req, res, next) => {
  if (!legacyServerExcelEnabled()) return disabled(req, res);
  try { return runtimeRequire('../controllers/excelJobController').create(req, res, next); } catch (error) { return next(error); }
});
router.get('/export-excel/jobs', authMiddleware, roles, canExport, (req, res, next) => {
  try { return runtimeRequire('../controllers/excelJobController').list(req, res, next); } catch (error) { return next(error); }
});
router.get('/export-excel/jobs/:jobId', authMiddleware, roles, canExport, (req, res, next) => {
  try { return runtimeRequire('../controllers/excelJobController').get(req, res, next); } catch (error) { return next(error); }
});
router.get('/export-excel/jobs/:jobId/download', authMiddleware, roles, canExport, (req, res, next) => {
  try { return runtimeRequire('../controllers/excelJobController').download(req, res, next); } catch (error) { return next(error); }
});

module.exports = router;
