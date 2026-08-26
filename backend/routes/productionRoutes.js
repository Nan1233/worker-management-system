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
// the whole backend during route registration.
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

// Lý do chỉnh sửa không còn là dữ liệu bắt buộc từ người dùng.
// Gán giá trị audit mặc định trước mọi middleware tiếp theo để backend
// không bao giờ trả CHANGE_REASON_REQUIRED cho thao tác sửa trên bảng.
const ensureApprovedEditReason = (req, _res, next) => {
  if (!req.body || typeof req.body !== "object") req.body = {};
  req.body.reason = String(req.body.reason || req.body.change_reason || "").trim() || "Cập nhật báo cáo đã duyệt";
  next();
};

router.put(
  "/:id",
  verifyToken,
  checkRole("admin","manager","lead"),
  ensureApprovedEditReason,
  notifyWorkerOnApprovedEdit,
  updateReport
);
router.delete("/:id",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_DELETE"),deleteReport);

module.exports = router;
