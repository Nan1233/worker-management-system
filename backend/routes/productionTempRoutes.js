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
    const [rows] = await db.promise().query(`SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username FROM report_edit_proposals p LEFT JOIN users u ON u.id = p.proposer_user_id WHERE p.id = ? LIMIT 1`, [id]);
    if (!rows?.[0]) return null;
    const row = rows[0];
    if (typeof row.proposed_data === "string") { try { row.proposed_data = JSON.parse(row.proposed_data); } catch { row.proposed_data = {}; } }
    return row;
};
const assertProposalAccess = async (req, reportId) => req.user?.role === "admin" ? true : ProductionTemp.canManageReport(Number(reportId), req.user.id, false);

router.post("/", authMiddleware, workerReportLimiter, checkRole("worker"), permission("WORKER_ENTRY"), validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:true,maxLength:150} }), controller.createTempReport);
router.post("/check-similar", authMiddleware, checkRole("worker"), permission("WORKER_ENTRY"), validate({ process_id:{required:true,type:"positiveInt"}, work_date:{required:true}, shift:{required:true,maxLength:20}, machine_no:{required:false,maxLength:100}, product_name:{required:true,maxLength:150} }), controller.checkSimilarReport);
router.get("/my", authMiddleware, checkRole("worker"), permission("WORKER_HISTORY"), controller.getMyTempReports);
router.get("/pending", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getPendingReports);
router.get("/approved", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVED_VIEW"), controller.getApprovedReports);
router.get("/dates", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempDates);
router.get("/by-date", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_PENDING_VIEW"), controller.getTempReportsByDate);

router.get("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
        const isLead = String(req.user?.role || "").toLowerCase() === "lead";
        const [rows] = await db.promise().query(`SELECT p.*, u.full_name AS proposer_name, u.username AS proposer_username, prt.work_date, prt.shift, prt.process_id, prt.machine_no, prt.product_name, w.worker_code, wu.full_name AS worker_name FROM report_edit_proposals p LEFT JOIN users u ON u.id = p.proposer_user_id LEFT JOIN production_reports_temp prt ON prt.id = p.report_id LEFT JOIN workers w ON w.id = prt.worker_id LEFT JOIN users wu ON wu.id = w.user_id WHERE (? = 0 OR p.proposer_user_id = ?) ORDER BY p.updated_at DESC, p.id DESC LIMIT 300`, [isLead ? 1 : 0, Number(req.user.id)]);
        const accessible = [];
        for (const row of rows || []) if (await assertProposalAccess(req, row.report_id)) {
            if (typeof row.proposed_data === "string") { try { row.proposed_data = JSON.parse(row.proposed_data); } catch { row.proposed_data = {}; } }
            accessible.push(row);
        }
        return res.json({ success:true, data:accessible });
    } catch (error) { console.error("GET EDIT PROPOSALS ERROR:", error); return res.status(error.status || 500).json({ success:false, message:error.message || "Không thể tải đề xuất sửa" }); }
});

router.post("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req, res) => {
    try {
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
    try{const id=Number(req.params.id),current=await proposalDetail(id);if(!current)return res.status(404).json({success:false,message:"Không tìm thấy đề xuất sửa"});if(!(await assertProposalAccess(req,current.report_id)))return res.status(403).json({success:false,message:"Đề xuất ngoài phạm vi phụ trách"});if(String(req.user.role).toLowerCase()==="lead"&&Number(current.proposer_user_id)!==Number(req.user.id))return res.status(403).json({success:false,message:"Bạn chỉ được sửa đề xuất của mình"});const reason=String(req.body?.reason??current.reason).trim(),proposedData=req.body?.proposed_data??current.proposed_data;if(reason.length<2||reason.length>1000)return res.status(400).json({success:false,message:"Nội dung đề xuất sửa phải từ 2 đến 1000 ký tự"});await db.promise().query(`UPDATE report_edit_proposals SET reason=?, proposed_data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,[reason,JSON.stringify(proposedData||{}),id]);return res.json({success:true,message:"Đã cập nhật đề xuất sửa",data:await proposalDetail(id)});}catch(error){console.error("UPDATE EDIT PROPOSAL ERROR:",error);return res.status(error.status||500).json({success:false,message:error.message||"Không thể cập nhật đề xuất sửa"});}
});

router.post("/edit-proposals/:id/review", authMiddleware, checkRole("manager","admin"), permission("REPORT_APPROVE"), async (req,res)=>{
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

router.delete("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), async (req,res)=>{try{const id=Number(req.params.id),current=await proposalDetail(id);if(!current)return res.status(404).json({success:false,message:"Không tìm thấy đề xuất sửa"});if(!(await assertProposalAccess(req,current.report_id)))return res.status(403).json({success:false,message:"Đề xuất ngoài phạm vi phụ trách"});if(String(req.user.role).toLowerCase()==="lead"&&Number(current.proposer_user_id)!==Number(req.user.id))return res.status(403).json({success:false,message:"Bạn chỉ được xóa đề xuất của mình"});await db.promise().query(`DELETE FROM report_edit_proposals WHERE id=?`,[id]);return res.json({success:true,message:"Đã xóa đề xuất sửa"});}catch(error){console.error("DELETE EDIT PROPOSAL ERROR:",error);return res.status(error.status||500).json({success:false,message:error.message||"Không thể xóa đề xuất sửa"});}});

router.post("/approve-selected",authMiddleware,checkRole("admin","manager","lead"),validate({ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true}}),permission("REPORT_APPROVE"),controller.approveSelectedReports);
router.post("/reject-selected",authMiddleware,checkRole("admin","manager","lead"),validate({ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true},reason:{required:true,type:"string",minLength:2,maxLength:500}}),permission("REPORT_APPROVE"),controller.rejectSelectedReports);
router.post("/approve",authMiddleware,checkRole("admin","manager","lead"),permission("REPORT_APPROVE"),controller.approveSelectedReports);
router.post("/:id/request-edit",authMiddleware,checkRole("admin","manager","lead"),permission("REPORT_APPROVE"),async(req,res)=>{try{const reportId=Number(req.params.id),reason=String(req.body?.reason||"").trim(),proposedData=req.body?.proposed_data||req.body?.payload||null;if(!Number.isInteger(reportId)||reportId<=0)return res.status(400).json({success:false,message:"ID báo cáo không hợp lệ"});const report=await ProductionTemp.getDetail(reportId);if(!report)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});if(!(await assertProposalAccess(req,reportId)))return res.status(403).json({success:false,message:"Báo cáo ngoài phạm vi phụ trách"});const [r]=await db.promise().query(`INSERT INTO report_edit_proposals (report_id,proposer_user_id,proposer_role,reason,proposed_data,status) VALUES(?,?,?,?,?,'pending')`,[reportId,Number(req.user.id),String(req.user.role||"").toLowerCase(),reason||"Tổ trưởng đề xuất sửa báo cáo",JSON.stringify(proposedData||report)]);return res.status(201).json({success:true,message:"Đã tạo đề xuất sửa, báo cáo chưa bị thay đổi",data:await proposalDetail(Number(r.insertId))});}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể gửi đề xuất sửa"});}});
router.get("/:id/logs",authMiddleware,checkRole("admin","manager","lead"),permission("AUDIT_VIEW"),controller.getReportActionLogs);
router.put("/:id",authMiddleware,checkRole("admin","manager","lead","worker"),validate({id:{in:"params",required:true,type:"positiveInt"}}),permission("REPORT_PENDING_EDIT","REPORT_APPROVE","WORKER_ENTRY"),async(req,res,next)=>{if(String(req.user?.role||"").toLowerCase()!=="lead")return next();try{const reportId=Number(req.params.id),report=await ProductionTemp.getDetail(reportId);if(!report)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});if(!(await assertProposalAccess(req,reportId)))return res.status(403).json({success:false,message:"Báo cáo ngoài phạm vi phụ trách"});const [r]=await db.promise().query(`INSERT INTO report_edit_proposals (report_id,proposer_user_id,proposer_role,reason,proposed_data,status) VALUES(?,?,?,?,?,'pending')`,[reportId,Number(req.user.id),'lead',String(req.body?.reason||"Tổ trưởng đề xuất sửa báo cáo").slice(0,1000),JSON.stringify(req.body||report)]);return res.status(201).json({success:true,message:"Đã tạo đề xuất sửa, báo cáo chưa bị thay đổi",data:await proposalDetail(Number(r.insertId))});}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể tạo đề xuất sửa"});}},notifyWorkerOnTempEdit,controller.updateTempReport);
router.get("/:id",authMiddleware,checkRole("admin","manager","lead","worker"),permission("REPORT_PENDING_VIEW","WORKER_HISTORY"),controller.getTempReportDetail);
module.exports=router;
