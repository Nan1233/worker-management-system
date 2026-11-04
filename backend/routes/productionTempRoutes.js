const express = require("express");

const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const notifyWorkerOnTempEdit = require("../middleware/notifyWorkerOnTempEdit");
const controller = require("../controllers/productionTempController");
const validate = require("../middleware/validateRequest");
const { workerReportLimiter } = require("../middleware/rateLimiters");
const ProductionTemp = require("../models/productionTempModel");

const { TtlCache } = require("../utils/cache");
const managerListCache = new TtlCache({ maxEntries: 300 });
const MANAGER_LIST_TTL_MS = 15000;
function invalidateManagerReportLists() {
    managerListCache.deleteByPrefix("manager:pending:");
    managerListCache.deleteByPrefix("manager:approved:");
}

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

router.post("/edit-proposals", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), controller.createEditProposal);

router.put("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), controller.updateEditProposal);

router.post("/edit-proposals/:id/review", authMiddleware, checkRole("manager", "admin", "lead"), permission("REPORT_APPROVE"), controller.reviewEditProposal);

router.delete("/edit-proposals/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), controller.deleteEditProposal);

router.post("/approve-selected",authMiddleware,checkRole("admin","admin_ops","manager","lead"),validate({ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true}}),permission("REPORT_APPROVE"),controller.approveSelectedReports);
router.post("/reject-selected",authMiddleware,checkRole("admin","admin_ops","manager","lead"),validate({ids:{required:true,type:"array",itemType:"positiveInt",minItems:1,maxItems:100,unique:true},reason:{required:true,type:"string",minLength:2,maxLength:500}}),permission("REPORT_APPROVE"),controller.rejectSelectedReports);
router.post("/approve",authMiddleware,checkRole("admin","admin_ops","manager","lead"),permission("REPORT_APPROVE"),controller.approveSelectedReports);
router.post("/:id/request-edit", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_APPROVE"), controller.requestEditProposal);
router.get("/:id", authMiddleware, checkRole("admin", "admin_ops", "manager", "lead", "worker"), permission("WORKER_HISTORY", "REPORT_PENDING_VIEW"), controller.getTempReportDetail);
router.get("/:id/logs",authMiddleware,checkRole("admin","admin_ops","manager","lead"),permission("AUDIT_VIEW"),controller.getReportActionLogs);

const denyAdminOpsPendingEdit = (req,res,next) => String(req.user?.role||"").toLowerCase() === "admin_ops"
  ? res.status(403).json({success:false,code:"ROLE_SCOPE_FORBIDDEN",message:"Admin vận hành không được sửa báo cáo đang chờ duyệt"})
  : next();

router.put("/:id",authMiddleware,checkRole("admin","admin_ops","manager","lead","worker"),denyAdminOpsPendingEdit,validate({id:{in:"params",required:true,type:"positiveInt"}}),permission("REPORT_PENDING_EDIT","REPORT_APPROVE","WORKER_ENTRY"),async(req,res,next)=>{if(String(req.user?.role||"").toLowerCase()!=="lead")return next();try{const reportId=Number(req.params.id),report=await ProductionTemp.getDetail(reportId);if(!report)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});if(Number(report.proposer_user_id)!==Number(req.user.id))return res.status(403).json({success:false,message:"Lead chỉ được sửa đề xuất của chính mình"});return next();}catch(error){return res.status(error.status||500).json({success:false,message:error.message||"Không thể kiểm tra quyền sửa báo cáo"});}},notifyWorkerOnTempEdit,controller.updateTempReport);

router.delete("/:id", authMiddleware, checkRole("admin", "manager", "lead"), permission("REPORT_DELETE"), controller.deleteTempReport);

router.invalidateManagerReportLists = invalidateManagerReportLists;
module.exports = router;
