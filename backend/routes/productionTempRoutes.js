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
router.get("/daily-hours", authMiddleware, checkRole("worker"), permission("WORKER_ENTRY"), controller.getDailyHours);
router.get("/pending", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getPendingReports);
router.get("/approved", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_APPROVED_VIEW"), controller.getApprovedReports);
router.get("/dates", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempDates);
router.get("/by-date", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempReportsByDate);

router.get("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), controller.getEditProposals);

router.post("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), editProposalController.createEditProposal);

router.put("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), editProposalController.updateEditProposal);

router.post("/edit-proposals/:id/review", authMiddleware, checkRole("manager","admin","lead"), permission("REPORT_APPROVE"), async (req,res)=>{
    try{
        const id=Number(req.params.id), decision=String(req.body?.decision||"").toLowerCase(), statusAfter=String(req.body?.status_after||"pending").toLowerCase();
        const current=await proposalDetail(id); if(!current)return res.status(404).json({success:false,message:"Không tìm thấy đề xuất sửa"});
        if(!(await assertProposalAccess(req,current.report_id)))return res.status(403).json({success:false,message:"Đề xuất ngoài phạm vi phụ trách"});
        if(current.status!=="pending")return res.status(400).json({success:false,message:"Đề xuất này đã được xử lý"});
        if(decision==="reject"){
            const reason=String(req.body?.reason||"").trim(); if(reason.length<2)return res.status(400).json({success:false,message:"Vui lòng nhập lý do từ chối"});
            await db.promise().query(`UPDATE report_edit_proposals SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=?`,[id]);
            return res.json({success:true,message:"Đã từ chối đề xuất sửa",data:await proposalDetail(id)});
        }
        if(decision!=="approve")return res.status(400).json({success:false,message:"Thao tác xử lý không hợp lệ"});
        const proposed=current.proposed_data&&typeof current.proposed_data==="object"?current.proposed_data:{};
        let resultPayload=null; let resultStatus=200;
        const fakeRes={status(code){resultStatus=code;return this;},json(body){resultPayload=body;return this;}};
        await controller.updateTempReport({params:{id:current.report_id},body:{...proposed,reason:`Duyệt đề xuất sửa #${id}`},user:req.user},fakeRes);
        if(resultStatus>=400||resultPayload?.success===false)return res.status(resultStatus||400).json(resultPayload||{success:false,message:"Không thể cập nhật báo cáo theo đề xuất"});
        if(statusAfter==="approved") await ProductionTemp.approveSelected([{id:current.report_id}],Number(req.user.id),req.user.role==="admin");
        const newStatus=statusAfter==="approved"?"approved":"accepted";
        await db.promise().query(`UPDATE report_edit_proposals SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,[newStatus,id]);
        return res.json({success:true,message:statusAfter==="approved"?"Đã sửa và duyệt báo cáo":"Đã áp dụng đề xuất, báo cáo đang chờ duyệt",data:await proposalDetail(id)});
    }catch(error){console.error("REVIEW EDIT PROPOSAL ERROR:",error);return res.status(error.status||500).json({success:false,message:error.message||"Không thể xử lý đề xuất sửa"});}
});

router.delete("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), editProposalController.deleteEditProposal);

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
