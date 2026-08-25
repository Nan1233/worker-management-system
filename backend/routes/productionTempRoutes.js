const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const notifyWorkerOnTempEdit = require("../middleware/notifyWorkerOnTempEdit");
const controller = require("../controllers/productionTempController");
const validate = require("../middleware/validateRequest");
const { workerReportLimiter } = require("../middleware/rateLimiters");
const db = require("../config/db");
const AuditService = require("../services/auditService");
const ProductionTemp = require("../models/productionTempModel");

router.post(
    "/",
    authMiddleware,
    workerReportLimiter,
    checkRole("worker"),
    permission("WORKER_ENTRY"),
    validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:true,maxLength:150} }),
    controller.createTempReport
);

router.post(
    "/check-similar",
    authMiddleware,
    checkRole("worker"),
    permission("WORKER_ENTRY"),
    validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:true,maxLength:150} }),
    controller.checkSimilarReport
);

router.get("/my", authMiddleware, checkRole("worker"), permission("WORKER_HISTORY"), controller.getMyTempReports);
router.get("/pending", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getPendingReports);
router.get("/approved", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVED_VIEW"), controller.getApprovedReports);
router.get("/dates", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempDates);
router.get("/by-date", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempReportsByDate);

router.post(
    "/approve-selected",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    validate({ ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true} }),
    permission("REPORT_APPROVE"),
    controller.approveSelectedReports
);

router.post(
    "/reject-selected",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    validate({ ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true}, reason:{required:true,type:"string",minLength:2,maxLength:500} }),
    permission("REPORT_APPROVE"),
    controller.rejectSelectedReports
);

router.post("/approve", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), controller.approveSelectedReports);

// Tổ trưởng/Quản lý đề xuất công nhân sửa báo cáo; không sửa trực tiếp dữ liệu.
router.post(
    "/:id/request-edit",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    permission("REPORT_APPROVE"),
    async (req, res) => {
        try {
            const reportId = Number(req.params.id);
            const reason = String(req.body?.reason || "").trim();
            if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });
            if (reason.length < 2 || reason.length > 1000) return res.status(400).json({ success: false, message: "Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự" });

            const report = await ProductionTemp.getDetail(reportId);
            if (!report) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
            if (req.user?.role !== "admin") {
                const canManage = await ProductionTemp.canManageReport(reportId, req.user.id, false);
                if (!canManage) return res.status(403).json({ success: false, message: "Báo cáo ngoài phạm vi phụ trách" });
            }

            const [workers] = await db.promise().query(
                `SELECT w.user_id AS worker_user_id
                   FROM production_reports_temp prt
                   JOIN workers w ON w.id = prt.worker_id
                  WHERE prt.id = ?
                  LIMIT 1`,
                [reportId]
            );
            const workerUserId = Number(workers?.[0]?.worker_user_id || 0);
            if (!workerUserId) return res.status(422).json({ success: false, message: "Không xác định được tài khoản công nhân của báo cáo" });

            const workDate = String(report.work_date || "").slice(0, 10);
            await AuditService.notifyUsers([workerUserId], {
                type: "report_edit_request",
                title: "Yêu cầu sửa báo cáo",
                message: `Báo cáo ngày ${workDate || "-"}, ca ${report.shift || "-"} có đề xuất sửa: ${reason}`,
                linkUrl: `/worker/history/${reportId}?source=pending`,
                entityType: "temp_report",
                entityId: reportId,
            });

            return res.status(200).json({ success: true, message: "Đã gửi đề xuất sửa cho công nhân" });
        } catch (error) {
            console.error("REQUEST REPORT EDIT ERROR:", error);
            return res.status(error.status || 500).json({ success: false, message: error.message || "Không thể gửi đề xuất sửa" });
        }
    }
);

router.get("/:id/logs", authMiddleware, checkRole("admin", "manager", "lead"), permission("AUDIT_VIEW"), controller.getReportActionLogs);

router.put(
    "/:id",
    authMiddleware,
    checkRole("admin", "manager", "worker"),
    validate({ id:{in:"params",required:true,type:"positiveInt"} }),
    permission("REPORT_PENDING_EDIT", "WORKER_ENTRY"),
    notifyWorkerOnTempEdit,
    controller.updateTempReport
);

router.get("/:id", authMiddleware, checkRole("admin", "manager", "lead", "worker"), permission("REPORT_PENDING_VIEW", "WORKER_HISTORY"), controller.getTempReportDetail);

module.exports = router;
