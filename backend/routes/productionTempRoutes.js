const express = require("express");

const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const notifyWorkerOnTempEdit = require("../middleware/notifyWorkerOnTempEdit");
const controller = require("../controllers/productionTempController");
const validate = require("../middleware/validateRequest");
const { workerReportLimiter } = require("../middleware/rateLimiters");
const { queryCountedDailyHours } = require("../utils/dailyCountedHours");
const db = require("../config/db");
const AuditService = require("../services/auditService");
const ProductionTemp = require("../models/productionTempModel");
const atomicApprovalModel = require("../models/productionTempApprovalModel");
const { getConnection, beginReadCommittedTransaction, query: transactionQuery, commit: commitTransaction, rollback: rollbackTransaction } = require("../models/productionTempModelShared");

const { TtlCache } = require("../utils/cache");
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;
function invalidateManagerReportLists() {
    managerListCache.deleteByPrefix("manager:pending:");
    managerListCache.deleteByPrefix("manager:approved:");
}

const proposalDetail = async (id) => {
    const [rows] = await db.promise().query(`SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username FROM report_edit_proposals p LEFT JOIN users u ON u.id = p.proposer_user_id WHERE p.id = ? LIMIT 1`, [id]);
    if (!rows?.[0]) return null;
    const row = rows[0];
    if (typeof row.proposed_data === "string") { try { row.proposed_data = JSON.parse(row.proposed_data); } catch { row.proposed_data = {}; } }
    return row;
};
const assertProposalAccess = async (req, reportId) => req.user?.role === "admin" ? true : ProductionTemp.canManageReport(Number(reportId), req.user.id, false);

const productionTempValidation = validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:false,maxLength:150} });

router.post("/", authMiddleware, workerReportLimiter, checkRole("worker"), permission("WORKER_ENTRY"), productionTempValidation, controller.createTempReport);
router.post("/check-similar", authMiddleware, checkRole("worker"), permission("WORKER_ENTRY"), productionTempValidation, controller.checkSimilarReport);
router.get("/my", authMiddleware, checkRole("worker"), permission("WORKER_HISTORY"), controller.getMyTempReports);
router.get("/daily-hours", authMiddleware, checkRole("worker"), permission("WORKER_ENTRY"), async (req, res) => {
    try {
        const workerId = Number(req.user?.worker_id);
        const workDate = String(req.query?.date || "").trim();
        if (!Number.isInteger(workerId) || workerId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return res.status(400).json({ success: false, message: "Ngày làm việc không hợp lệ" });
        const excludeRaw = req.query?.exclude_report_id;
        const excludeTempReportId = excludeRaw === undefined || excludeRaw === "" ? null : Number(excludeRaw);
        if (excludeTempReportId !== null && (!Number.isInteger(excludeTempReportId) || excludeTempReportId <= 0)) return res.status(400).json({ success: false, message: "Mã báo cáo đang sửa không hợp lệ" });
        // Same query as every 12-hour write guard (utils/dailyCountedHours.js): GC machine reports count
        // MAX(machine - deduction) of their lines and split GC groups count once. The worker filter means
        // excluding a report id can only drop this worker's own report being edited.
        const countedHours = await queryCountedDailyHours((sql, params) => db.promise().query(sql, params).then(([rows]) => rows), { workerId, workDate, excludeTempReportId });
        return res.json({ success: true, data: { work_date: workDate, counted_hours: Number(countedHours.toFixed(4)), limit_hours: 12 } });
    } catch (error) { console.error("GET DAILY WORKING HOURS ERROR:", error); return res.status(error.status || 500).json({ success: false, message: error.message || "Không thể lấy tổng giờ làm hôm nay" }); }
});
router.get("/pending", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getPendingReports);
router.get("/approved", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_APPROVED_VIEW"), controller.getApprovedReports);
router.get("/dates", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempDates);
router.get("/by-date", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempReportsByDate);

router.get("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
        const [rows] = await db.promise().query(`SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username, prt.work_date, prt.shift, prt.process_id, prt.machine_no, prt.product_name, w.worker_code, wu.full_name AS worker_name FROM report_edit_proposals p LEFT JOIN users u ON u.id = p.proposer_user_id LEFT JOIN production_reports_temp prt ON prt.id = p.report_id LEFT JOIN workers w ON w.id = prt.worker_id LEFT JOIN users wu ON wu.id = w.user_id ORDER BY p.updated_at DESC, p.id DESC LIMIT 300`);
        const accessible = [];
        for (const row of rows || []) if (await assertProposalAccess(req, row.report_id)) {
            if (typeof row.proposed_data === "string") { try { row.proposed_data = JSON.parse(row.proposed_data); } catch { row.proposed_data = {}; } }
            accessible.push(row);
        }
        return res.json({success:true, data:accessible});
    } catch (error) { console.error("GET EDIT PROPOSALS ERROR:", error); return res.status(error.status || 500).json({success:false,message:error.message || "Không thể tải đề xuất sửa"}); }
});

router.post("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req,res)=>{
    try{
        const reportId=Number(req.body?.report_id), reason=String(req.body?.reason||"").trim(), proposedData=req.body?.proposed_data;
        if(!Number.isInteger(reportId)||reportId<=0)return res.status(400).json({success:false,message:"ID báo cáo không hợp lệ"});
        if(reason.length<2||reason.length>1000)return res.status(400).json({success:false,message:"Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự"});
        if(!proposedData||typeof proposedData!=="object")return res.status(400).json({success:false,message:"Thiếu nội dung thay đổi đề xuất"});
        const report=await ProductionTemp.getDetail(reportId); if(!report)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});
        if(!(await assertProposalAccess(req,reportId)))return res.status(403).json({success:false,message:"Báo cáo ngoài phạm vi phụ trách"});
        const [result]=await db.promise().query(`INSERT INTO report_edit_proposals (report_id, proposer_user_id, proposer_role, reason, proposed_data, status) VALUES (?, ?, ?, ?, ?, 'pending')`,[reportId,Number(req.user.id),String(req.user.role||"").toLowerCase(),reason,JSON.stringify(proposedData)]);
        return res.status(201).json({success:true,message:"Đã tạo đề xuất sửa",data:await proposalDetail(Number(result.insertId))});
    } catch(error){console.error("CREATE EDIT PROPOSAL ERROR:",error);return res.status(error.status||500).json({success:false,message:error.message||"Không thể tạo đề xuất sửa"});}
});

router.put("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req,res)=>{
    try{const id=Number(req.params.id),current=await proposalDetail(id);if(!current)return res.status(404).json({success:false,message:"Không tìm thấy đề xuất sửa"});if(!(await assertProposalAccess(req,current.report_id)))return res.status(403).json({success:false,message:"Đề xuất ngoài phạm vi phụ trách"});const reason=String(req.body?.reason??current.reason).trim(),proposedData=req.body?.proposed_data??current.proposed_data;if(reason.length<2||reason.length>1000)return res.status(400).json({success:false,message:"Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự"});const [updated]=await db.promise().query(`UPDATE report_edit_proposals SET reason=?, proposed_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`,[reason,JSON.stringify(proposedData||{}),id]);if(Number(updated.affectedRows)!==1)return res.status(409).json({success:false,code:'PROPOSAL_NOT_PENDING',message:'Đề xuất đã được xử lý, không thể chỉnh sửa'});return res.json({success:true,message:"Đã cập nhật đề xuất sửa",data:await proposalDetail(id)});}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể cập nhật đề xuất sửa"});}
});

router.post("/edit-proposals/:id/review", authMiddleware, checkRole("manager","admin","lead"), permission("REPORT_APPROVE"), async (req,res)=>{
    const id = Number(req.params.id);
    const decision = String(req.body?.decision || "").toLowerCase();
    const statusAfter = String(req.body?.status_after || "pending").toLowerCase();
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({success:false,message:"ID đề xuất không hợp lệ"});
    if (!["approve","reject"].includes(decision)) return res.status(400).json({success:false,message:"Thao tác xử lý không hợp lệ"});
    if (decision === "approve" && !["pending","approved"].includes(statusAfter)) return res.status(400).json({success:false,code:"INVALID_STATUS_AFTER",message:"Trạng thái sau xử lý không hợp lệ"});
    const rejectReason = String(req.body?.reason || "").trim();
    if (decision === "reject" && rejectReason.length < 2) return res.status(400).json({success:false,message:"Vui lòng nhập lý do từ chối"});

    let connection;
    let committed = false;
    const postCommitCallbacks = [];
    try {
        const initial = await proposalDetail(id);
        if (!initial) return res.status(404).json({success:false,message:"Không tìm thấy đề xuất sửa"});
        if (!(await assertProposalAccess(req, initial.report_id))) return res.status(403).json({success:false,message:"Đề xuất ngoài phạm vi phụ trách"});

        connection = await getConnection();
        await beginReadCommittedTransaction(connection);
        const locked = await transactionQuery(connection,
            "SELECT id, report_id, proposed_data, status FROM report_edit_proposals WHERE id=? FOR UPDATE", [id]);
        const current = locked[0];
        if (!current || Number(current.report_id) !== Number(initial.report_id)) {
            throw Object.assign(new Error("Đề xuất đã thay đổi"), {status:409,code:"PROPOSAL_CHANGED"});
        }
        if (current.status !== "pending") throw Object.assign(new Error("Đề xuất đã được xử lý"), {status:409,code:"PROPOSAL_NOT_PENDING"});

        if (decision === "reject") {
            const updated = await transactionQuery(connection,
                "UPDATE report_edit_proposals SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", [id]);
            if (Number(updated.affectedRows) !== 1) throw Object.assign(new Error("Đề xuất đã được xử lý"), {status:409});
            await commitTransaction(connection);
            committed = true;
            let rejectedProposal = {id,report_id:current.report_id,status:"rejected"};
            try { rejectedProposal = await proposalDetail(id) || rejectedProposal; }
            catch (readError) { console.error("PROPOSAL REJECTION POST-COMMIT READ ERROR:",readError); }
            return res.json({success:true,message:"Đã từ chối đề xuất sửa",data:rejectedProposal});
        }

        let proposed = current.proposed_data;
        if (typeof proposed === "string") {
            try { proposed = JSON.parse(proposed); }
            catch { throw Object.assign(new Error("Dữ liệu đề xuất không hợp lệ"), {status:422}); }
        }
        if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) {
            throw Object.assign(new Error("Dữ liệu đề xuất không hợp lệ"), {status:422});
        }
        let resultPayload = null;
        let resultStatus = 200;
        const fakeRes = {
            status(code) { resultStatus = code; return this; },
            json(body) { resultPayload = body; return this; }
        };
        await controller.updateTempReport({
            params:{id:current.report_id},
            body:{...proposed,reason:`Duyệt đề xuất sửa #${id}`},
            user:req.user,
            transactionConnection:connection
        },fakeRes);
        if (resultStatus >= 400 || resultPayload?.success === false || resultPayload?.success !== true) {
            throw Object.assign(new Error(resultPayload?.message || "Không thể cập nhật báo cáo theo đề xuất"),
                {status:resultStatus >= 400 ? resultStatus : 500, code:resultPayload?.code});
        }

        if (statusAfter === "approved") {
            // The public ProductionTemp facade runs legacy backfills outside the caller's
            // transaction and drops the fourth (options) argument. Never call it here.
            // Fail closed on legacy machine reports rather than mutate them outside atomic review.
            const legacy = await transactionQuery(connection,
                `SELECT t.id FROM production_reports_temp t
                   LEFT JOIN processes p ON p.id=t.process_id
                  WHERE t.id=? AND UPPER(COALESCE(t.operation_mode,''))='MACHINE'
                    AND UPPER(TRIM(COALESCE(p.process_code,''))) NOT IN ('CVK','XLBV','SX3')
                    AND t.process_id NOT IN (30002,60006)
                    AND NOT EXISTS (SELECT 1 FROM production_temp_machine_lines ml WHERE ml.temp_report_id=t.id)
                  LIMIT 1`, [current.report_id]);
            if (legacy.length) throw Object.assign(new Error("Báo cáo máy cũ thiếu dòng máy; cần bổ sung dữ liệu trước khi duyệt đề xuất"), {status:409,code:"LEGACY_MACHINE_LINE_REQUIRES_REVIEW"});
            await atomicApprovalModel.approveSelected([{id:current.report_id}],Number(req.user.id),req.user.role === "admin",
                {connection,postCommitCallbacks});
        }
        const newStatus = statusAfter === "approved" ? "approved" : "accepted";
        const transitioned = await transactionQuery(connection,
            "UPDATE report_edit_proposals SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'", [newStatus,id]);
        if (Number(transitioned.affectedRows) !== 1) throw Object.assign(new Error("Đề xuất đã được xử lý đồng thời"), {status:409});

        await commitTransaction(connection);
        committed = true;
        for (const callback of postCommitCallbacks) {
            try { await callback(); } catch (notificationError) {
                console.error("PROPOSAL POST-COMMIT NOTIFICATION ERROR:", notificationError);
            }
        }
        let finalProposal = {id,report_id:current.report_id,status:newStatus};
        try { finalProposal = await proposalDetail(id) || finalProposal; }
        catch (readError) { console.error("PROPOSAL POST-COMMIT READ ERROR:", readError); }
        return res.json({success:true,message:statusAfter === "approved" ? "Đã sửa và duyệt báo cáo" : "Đã áp dụng đề xuất, báo cáo đang chờ duyệt",data:finalProposal});
    } catch(error) {
        if (connection && !committed) {
            const rolledBack = await rollbackTransaction(connection);
            if (rolledBack?.ok === false) console.error("PROPOSAL REVIEW ROLLBACK ERROR:",rolledBack.error);
        }
        console.error("REVIEW EDIT PROPOSAL ERROR:",error);
        return res.status(error.status || 500).json({success:false,code:error.code || undefined,message:error.message || "Không thể xử lý đề xuất sửa"});
    } finally {
        if (connection) connection.release();
    }
});

router.delete("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req,res)=>{try{const id=Number(req.params.id),current=await proposalDetail(id);if(!current)return res.status(404).json({success:false,message:"Không tìm thấy đề xuất sửa"});if(!(await assertProposalAccess(req,current.report_id)))return res.status(403).json({success:false,message:"Đề xuất ngoài phạm vi phụ trách"});const [deleted]=await db.promise().query(`DELETE FROM report_edit_proposals WHERE id=? AND status='pending'`,[id]);if(Number(deleted.affectedRows)!==1)return res.status(409).json({success:false,code:'PROPOSAL_NOT_PENDING',message:'Chỉ có thể xóa đề xuất đang chờ xử lý'});return res.json({success:true,message:"Đã xóa đề xuất sửa"});}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể xóa đề xuất sửa"});}});

router.post("/approve-selected",authMiddleware,checkRole("admin","admin_ops","manager","lead"),validate({ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true}}),permission("REPORT_APPROVE"),controller.approveSelectedReports);
router.post("/reject-selected",authMiddleware,checkRole("admin","admin_ops","manager","lead"),validate({ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true},reason:{required:true,type:"string",minLength:2,maxLength:500}}),permission("REPORT_APPROVE"),controller.rejectSelectedReports);
router.post("/approve",authMiddleware,checkRole("admin","admin_ops","manager","lead"),permission("REPORT_APPROVE"),controller.approveSelectedReports);
router.post("/:id/request-edit",authMiddleware,checkRole("admin","manager","lead"),permission("REPORT_APPROVE"),async(req,res)=>{try{const reportId=Number(req.params.id),reason=String(req.body?.reason||"").trim(),proposedData=req.body?.proposed_data||req.body?.payload||null;if(!Number.isInteger(reportId)||reportId<=0)return res.status(400).json({success:false,message:"ID báo cáo không hợp lệ"});const report=await ProductionTemp.getDetail(reportId);if(!report)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});if(!(await assertProposalAccess(req,reportId)))return res.status(403).json({success:false,message:"Báo cáo ngoài phạm vi phụ trách"});const [r]=await db.promise().query(`INSERT INTO report_edit_proposals (report_id,proposer_user_id,proposer_role,reason,proposed_data,status) VALUES(?,?,?,?,?,'pending')`,[reportId,Number(req.user.id),String(req.user.role||"").toLowerCase(),reason||"Tổ trưởng đề xuất sửa báo cáo",JSON.stringify(proposedData||report)]);return res.status(201).json({success:true,message:"Đã tạo đề xuất sửa, báo cáo chưa bị thay đổi",data:await proposalDetail(Number(r.insertId))});}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể tạo đề xuất sửa"});}});
router.get("/:id", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead", "worker"), permission("WORKER_HISTORY", "REPORT_PENDING_VIEW"), controller.getTempReportDetail);
router.get("/:id/logs",authMiddleware,checkRole("admin","admin_ops","manager","lead"),permission("AUDIT_VIEW"),controller.getReportActionLogs);

const denyAdminOpsPendingEdit = (req,res,next) => String(req.user?.role||"").toLowerCase() === "admin_ops"
  ? res.status(403).json({success:false,code:"ROLE_SCOPE_FORBIDDEN",message:"Admin vận hành không được sửa báo cáo đang chờ duyệt"})
  : next();

router.put("/:id",authMiddleware,checkRole("admin","admin_ops","manager","lead","worker"),denyAdminOpsPendingEdit,validate({id:{in:"params",required:true,type:"positiveInt"}}),permission("REPORT_PENDING_EDIT","REPORT_APPROVE","WORKER_ENTRY"),async(req,res,next)=>{if(String(req.user?.role||"").toLowerCase()!=="lead")return next();try{const reportId=Number(req.params.id),report=await ProductionTemp.getDetail(reportId);if(!report)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});if(Number(report.proposer_user_id)!==Number(req.user.id))return res.status(403).json({success:false,message:"Lead chỉ được sửa đề xuất của chính mình"});return next();}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể kiểm tra quyền sửa báo cáo"});}},notifyWorkerOnTempEdit,controller.updateTempReport);

router.delete("/:id",authMiddleware,checkRole("admin","manager","lead"),permission("REPORT_DELETE"),async(req,res)=>{try{const reportId=Number(req.params.id);if(!Number.isInteger(reportId)||reportId<=0)return res.status(400).json({success:false,message:"ID báo cáo không hợp lệ"});const reason=String(req.body?.reason||"").trim();if(!reason)return res.status(400).json({success:false,message:"Vui lòng nhập lý do xóa báo cáo"});const result=await ProductionTemp.deleteTempReport(reportId,Number(req.user.id),req.user.role==="admin",reason,requestMeta(req));invalidateManagerReportLists();return res.json({success:true,message:"Đã xóa báo cáo",data:result});}catch(error){console.error("DELETE TEMP REPORT ERROR:",error);return res.status(error.status||500).json({success:false,message:error.message||"Không thể xóa báo cáo"});}});

router.invalidateManagerReportLists = invalidateManagerReportLists;
module.exports = router;
