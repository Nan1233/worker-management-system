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

const proposalDetail = async (id) => {
    const [rows] = await db.promise().query(
        `SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username
           FROM report_edit_proposals p
           LEFT JOIN users u ON u.id = p.proposer_user_id
          WHERE p.id = ?
          LIMIT 1`,
        [id]
    );
    if (!rows?.[0]) return null;
    const row = rows[0];
    if (typeof row.proposed_data === "string") {
        try { row.proposed_data = JSON.parse(row.proposed_data); } catch { row.proposed_data = {}; }
    }
    return row;
};

const assertProposalAccess = async (req, reportId) => {
    if (req.user?.role === "admin") return true;
    return ProductionTemp.canManageReport(Number(reportId), req.user.id, false);
};

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

// Proposal CRUD. Both lead and manager may add/edit/delete proposals.
router.get("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
        const [rows] = await db.promise().query(
            `SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username,
                    prt.work_date, prt.shift, prt.process_id, prt.machine_no, prt.product_name,
                    w.worker_code, wu.full_name AS worker_name
               FROM report_edit_proposals p
               LEFT JOIN users u ON u.id = p.proposer_user_id
               LEFT JOIN production_reports_temp prt ON prt.id = p.report_id
               LEFT JOIN workers w ON w.id = prt.worker_id
               LEFT JOIN users wu ON wu.id = w.user_id
              ORDER BY p.updated_at DESC, p.id DESC
              LIMIT 300`
        );
        const accessible = [];
        for (const row of rows || []) {
            if (await assertProposalAccess(req, row.report_id)) {
                if (typeof row.proposed_data === "string") {
                    try { row.proposed_data = JSON.parse(row.proposed_data); } catch { row.proposed_data = {}; }
                }
                accessible.push(row);
            }
        }
        return res.json({ success: true, data: accessible });
    } catch (error) {
        console.error("GET EDIT PROPOSALS ERROR:", error);
        return res.status(error.status || 500).json({ success: false, message: error.message || "Không thể tải đề xuất sửa" });
    }
});

router.post("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
        const reportId = Number(req.body?.report_id);
        const reason = String(req.body?.reason || "").trim();
        const proposedData = req.body?.proposed_data;
        if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ success:false, message:"ID báo cáo không hợp lệ" });
        if (reason.length < 2 || reason.length > 1000) return res.status(400).json({ success:false, message:"Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự" });
        if (!proposedData || typeof proposedData !== "object") return res.status(400).json({ success:false, message:"Thiếu nội dung thay đổi đề xuất" });
        const report = await ProductionTemp.getDetail(reportId);
        if (!report) return res.status(404).json({ success:false, message:"Không tìm thấy báo cáo" });
        if (!(await assertProposalAccess(req, reportId))) return res.status(403).json({ success:false, message:"Báo cáo ngoài phạm vi phụ trách" });
        const [result] = await db.promise().query(
            `INSERT INTO report_edit_proposals (report_id, proposer_user_id, proposer_role, reason, proposed_data, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
            [reportId, Number(req.user.id), String(req.user.role || "").toLowerCase(), reason, JSON.stringify(proposedData)]
        );
        const id = Number(result.insertId);
        const detail = await proposalDetail(id);
        return res.status(201).json({ success:true, message:"Đã tạo đề xuất sửa", data:detail });
    } catch (error) {
        console.error("CREATE EDIT PROPOSAL ERROR:", error);
        return res.status(error.status || 500).json({ success:false, message:error.message || "Không thể tạo đề xuất sửa" });
    }
});

router.put("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const current = await proposalDetail(id);
        if (!current) return res.status(404).json({ success:false, message:"Không tìm thấy đề xuất sửa" });
        if (!(await assertProposalAccess(req, current.report_id))) return res.status(403).json({ success:false, message:"Đề xuất ngoài phạm vi phụ trách" });
        const reason = String(req.body?.reason ?? current.reason).trim();
        const proposedData = req.body?.proposed_data ?? current.proposed_data;
        if (reason.length < 2 || reason.length > 1000) return res.status(400).json({ success:false, message:"Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự" });
        await db.promise().query(
            `UPDATE report_edit_proposals SET reason = ?, proposed_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [reason, JSON.stringify(proposedData || {}), id]
        );
        return res.json({ success:true, message:"Đã cập nhật đề xuất sửa", data:await proposalDetail(id) });
    } catch (error) {
        console.error("UPDATE EDIT PROPOSAL ERROR:", error);
        return res.status(error.status || 500).json({ success:false, message:error.message || "Không thể cập nhật đề xuất sửa" });
    }
});

router.delete("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
        const id = Number(req.params.id);
        const current = await proposalDetail(id);
        if (!current) return res.status(404).json({ success:false, message:"Không tìm thấy đề xuất sửa" });
        if (!(await assertProposalAccess(req, current.report_id))) return res.status(403).json({ success:false, message:"Đề xuất ngoài phạm vi phụ trách" });
        await db.promise().query(`DELETE FROM report_edit_proposals WHERE id = ?`, [id]);
        return res.json({ success:true, message:"Đã xóa đề xuất sửa" });
    } catch (error) {
        console.error("DELETE EDIT PROPOSAL ERROR:", error);
        return res.status(error.status || 500).json({ success:false, message:error.message || "Không thể xóa đề xuất sửa" });
    }
});

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

// Tổ trưởng/Quản lý đề xuất sửa báo cáo; không sửa trực tiếp dữ liệu.
router.post(
    "/:id/request-edit",
    authMiddleware,
    checkRole("admin", "manager", "lead"),
    permission("REPORT_APPROVE"),
    async (req, res) => {
        try {
            const reportId = Number(req.params.id);
            const reason = String(req.body?.reason || "").trim();
            const proposedData = req.body?.proposed_data || req.body?.payload || null;
            if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ success: false, message: "ID báo cáo không hợp lệ" });
            if (reason.length < 2 || reason.length > 1000) return res.status(400).json({ success: false, message: "Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự" });
            const report = await ProductionTemp.getDetail(reportId);
            if (!report) return res.status(404).json({ success: false, message: "Không tìm thấy báo cáo" });
            if (!(await assertProposalAccess(req, reportId))) return res.status(403).json({ success: false, message: "Báo cáo ngoài phạm vi phụ trách" });
            const snapshot = proposedData && typeof proposedData === "object" ? proposedData : report;
            const [insertResult] = await db.promise().query(
                `INSERT INTO report_edit_proposals (report_id, proposer_user_id, proposer_role, reason, proposed_data, status)
                 VALUES (?, ?, ?, ?, ?, 'pending')`,
                [reportId, Number(req.user.id), String(req.user.role || "").toLowerCase(), reason, JSON.stringify(snapshot)]
            );
            const [workers] = await db.promise().query(
                `SELECT w.user_id AS worker_user_id FROM production_reports_temp prt JOIN workers w ON w.id = prt.worker_id WHERE prt.id = ? LIMIT 1`,
                [reportId]
            );
            const workerUserId = Number(workers?.[0]?.worker_user_id || 0);
            if (workerUserId) {
                const workDate = String(report.work_date || "").slice(0, 10);
                await AuditService.notifyUsers([workerUserId], {
                    type: "report_edit_request",
                    title: "Yêu cầu sửa báo cáo",
                    message: `Báo cáo ngày ${workDate || "-"}, ca ${report.shift || "-"} có đề xuất sửa: ${reason}`,
                    linkUrl: `/worker/history/${reportId}?source=pending`,
                    entityType: "temp_report",
                    entityId: reportId,
                });
            }
            return res.status(201).json({ success: true, message: "Đã tạo đề xuất sửa cho công nhân", data: await proposalDetail(Number(insertResult.insertId)) });
        } catch (error) {
            console.error("REQUEST REPORT EDIT ERROR:", error);
            return res.status(error.status || 500).json({ success: false, message: error.message || "Không thể gửi đề xuất sửa" });
        }
    }
);

router.get("/:id/logs", authMiddleware, checkRole("admin", "manager", "lead"), permission("AUDIT_VIEW"), controller.getReportActionLogs);

// Quản lý lưu trực tiếp. Tổ trưởng chỉ tạo đề xuất, không được cập nhật báo cáo.
router.put(
    "/:id",
    authMiddleware,
    checkRole("admin", "manager", "lead", "worker"),
    validate({ id:{in:"params",required:true,type:"positiveInt"} }),
    permission("REPORT_PENDING_EDIT", "REPORT_APPROVE", "WORKER_ENTRY"),
    async (req, res, next) => {
        if (String(req.user?.role || "").toLowerCase() !== "lead") return next();
        try {
            const reportId = Number(req.params.id);
            const report = await ProductionTemp.getDetail(reportId);
            if (!report) return res.status(404).json({ success:false, message:"Không tìm thấy báo cáo" });
            if (!(await assertProposalAccess(req, reportId))) return res.status(403).json({ success:false, message:"Báo cáo ngoài phạm vi phụ trách" });
            const reason = String(req.body?.reason || req.body?.note || "Tổ trưởng đề xuất sửa báo cáo").trim();
            const [result] = await db.promise().query(
                `INSERT INTO report_edit_proposals (report_id, proposer_user_id, proposer_role, reason, proposed_data, status)
                 VALUES (?, ?, 'lead', ?, ?, 'pending')`,
                [reportId, Number(req.user.id), reason.slice(0, 1000), JSON.stringify(req.body || report)]
            );
            return res.status(201).json({ success:true, message:"Đã tạo đề xuất sửa, báo cáo chưa bị thay đổi", data:await proposalDetail(Number(result.insertId)) });
        } catch (error) {
            console.error("LEAD UPDATE-AS-PROPOSAL ERROR:", error);
            return res.status(error.status || 500).json({ success:false, message:error.message || "Không thể tạo đề xuất sửa" });
        }
    },
    notifyWorkerOnTempEdit,
    controller.updateTempReport
);

router.get("/:id", authMiddleware, checkRole("admin", "manager", "lead", "worker"), permission("REPORT_PENDING_VIEW", "WORKER_HISTORY"), controller.getTempReportDetail);

module.exports = router;
