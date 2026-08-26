const express = require("express");
const router = express.Router();
const { getAllReports,getReportDates,getReportsByDate,getReportById,updateReport,deleteReport,restoreReportVersion } = require("../controllers/productionController");
const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const { expensiveUserLimiter } = require("../middleware/rateLimiters");
const notifyWorkerOnApprovedEdit = require("../middleware/notifyWorkerOnApprovedEdit");

router.get("/dates",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_VIEW"),getReportDates);
router.get("/by-date",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_VIEW"),getReportsByDate);
router.get("/",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_VIEW"),getAllReports);

// Lazy-load Excel sync so a stale/mismatched controller export can never crash
// the whole backend during route registration. The current controller exports
// syncExcelEdits and is invoked normally at request time.
router.post(
  "/excel-sync",
  verifyToken,
  checkRole("admin","manager"),
  permission("EXCEL_DB_SYNC"),
  expensiveUserLimiter,
  (req, res, next) => {
    try {
      const { syncExcelEdits } = require("../controllers/excelEditSyncController");
      if (typeof syncExcelEdits !== "function") {
        return res.status(500).json({
          success: false,
          code: "EXCEL_SYNC_HANDLER_UNAVAILABLE",
          message: "Mô-đun đồng bộ Excel chưa sẵn sàng. Vui lòng triển khai lại backend mới nhất."
        });
      }
      return syncExcelEdits(req, res, next);
    } catch (error) {
      return next(error);
    }
  }
);

router.get("/:id",verifyToken,checkRole("admin","manager","lead","worker"),getReportById);
router.post("/:id/versions/:versionNo/restore",verifyToken,checkRole("admin","manager"),permission("REPORT_APPROVED_EDIT"),restoreReportVersion);

// Tổ trưởng (lead) có quyền quản lý các công đoạn được cấp phạm vi.
// Process scope + business authorization trong updateApprovedReport() tiếp tục
// kiểm tra công đoạn thực tế của từng báo cáo; không mở quyền sửa toàn hệ thống.
router.put("/:id",verifyToken,checkRole("admin","manager","lead"),notifyWorkerOnApprovedEdit,updateReport);
router.delete("/:id",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_DELETE"),deleteReport);

module.exports = router;
