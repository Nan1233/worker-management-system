const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/roleMiddleware');
const permission = require('../middleware/permissionMiddleware');
const { expensiveUserLimiter } = require('../middleware/rateLimiters');
const { exportRequestGuard } = require('../middleware/exportRequestGuard');
const { assertActorProcessAccess } = require('../services/processAuthorizationService');
const db = require('../config/db');
const validate = require('../middleware/validateRequest');
const companyExcelDataController = require('../controllers/companyExcelDataController');
const cloudflareExcelExportController = require('../controllers/cloudflareExcelExportController');
const { anyEnvEnabled } = require('../utils/featureFlags');

const roles = checkRole('admin', 'admin_ops', 'manager', 'lead');
const canExport = permission('REPORT_EXPORT');
const requireGcProcessScope = async (req,res,next) => {
  try {
    // Resolve GC by its stable business code, not by an environment-specific numeric ID.
    const [rows] = await db.promise().query(
      "SELECT id FROM processes WHERE UPPER(TRIM(process_code))='GC' AND LOWER(COALESCE(status,'active')) IN ('active','enabled','1') ORDER BY id LIMIT 1"
    );
    const gcProcessId = Number(rows?.[0]?.id);
    if (!Number.isInteger(gcProcessId) || gcProcessId <= 0) {
      return res.status(503).json({success:false,code:'GC_PROCESS_NOT_CONFIGURED',message:'Không xác định được công đoạn Gia công để xuất Excel'});
    }
    await assertActorProcessAccess(req.user,gcProcessId,{action:'REPORT_EXPORT_GC'});
    return next();
  } catch (error) {
    return next(error);
  }
};
const requireRequestedProcessScope = (req,res,next) => assertActorProcessAccess(req.user,req.body?.processId,{action:'REPORT_EXPORT_PROCESS'}).then(()=>next()).catch(next);
const denyAdminOpsCompanyWide = (req,res,next) => req.user?.role === 'admin_ops'
  ? res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Admin vận hành chỉ được xuất Excel trong phạm vi công đoạn được phân công'})
  : next();
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

router.get('/export-excel/company-status', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, (req, res) => res.json({
  success: true,
  version: 'desktop-monthly-excel',
  mode: 'DESKTOP_JSON_ONLY',
  serverHeavyExcel: false
}));

router.get('/export-excel/company-data', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, companyExcelDataController.get);
router.get('/export-excel/processes', authMiddleware, roles, canExport, (req, res, next) => {
  try { return desktopController().listProcesses(req, res, next); } catch (error) { return next(error); }
});

// Cloudflare Workers do not render XLSX locally. They proxy the authenticated
// export request to the Node/Render backend, where ExcelJS and the template
// filesystem are available.
router.post('/export-excel', authMiddleware, roles, canExport, requireGcProcessScope, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), exportExcelController);
router.post('/export-excel/process', authMiddleware, roles, canExport, requireRequestedProcessScope, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, processId:{required:true,type:'number'} }), exportProcessExcelController);

// Kept as explicit Node/Render targets for compatibility with older clients.
// The same proxy marker is accepted by the main endpoints above.
router.post('/export-excel/render-proxy', authMiddleware, roles, canExport, requireGcProcessScope, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), (req, res, next) => {
  try {
    res.setHeader('X-KTC-Excel-Backend', 'node-render');
    return legacyController().exportGiaCongExcel(req, res, next);
  } catch (error) { return next(error); }
});
router.post('/export-excel/process/render-proxy', authMiddleware, roles, canExport, requireRequestedProcessScope, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, processId:{required:true,type:'number'} }), (req, res, next) => {
  try {
    res.setHeader('X-KTC-Excel-Backend', 'node-render');
    return desktopController().exportProcess(req, res, next);
  } catch (error) { return next(error); }
});

router.get('/export-excel/company-files', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, (req, res, next) => {
  try { return desktopController().listCompanyFiles(req, res, next); } catch (error) { return next(error); }
});
router.post('/export-excel/company-build-all', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'} }), (req, res, next) => {
  if (!legacyServerExcelEnabled()) return disabled(req, res);
  try { return desktopController().buildAllCompanyFiles(req, res, next); } catch (error) { return next(error); }
});
router.post('/export-excel/company-file', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, exportRequestGuard, expensiveUserLimiter, validate({ date:{required:true,type:'date'}, groupCode:{required:true,type:'string'} }), (req, res, next) => {
  if (!legacyServerExcelEnabled()) return disabled(req, res);
  try { return desktopController().exportCompanyFile(req, res, next); } catch (error) { return next(error); }
});
router.post('/export-excel/jobs', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, exportRequestGuard, expensiveUserLimiter, (req, res, next) => {
  if (!legacyServerExcelEnabled()) return disabled(req, res);
  try { return runtimeRequire('../controllers/excelJobController').create(req, res, next); } catch (error) { return next(error); }
});
router.get('/export-excel/jobs', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, (req, res, next) => {
  try { return runtimeRequire('../controllers/excelJobController').list(req, res, next); } catch (error) { return next(error); }
});
router.get('/export-excel/jobs/:jobId', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, (req, res, next) => {
  try { return runtimeRequire('../controllers/excelJobController').get(req, res, next); } catch (error) { return next(error); }
});
router.get('/export-excel/jobs/:jobId/download', authMiddleware, roles, canExport, denyAdminOpsCompanyWide, (req, res, next) => {
  try { return runtimeRequire('../controllers/excelJobController').download(req, res, next); } catch (error) { return next(error); }
});

module.exports = router;
