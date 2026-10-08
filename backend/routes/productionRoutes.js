const express = require("express");
const router = express.Router();
const { getAllReports,getReportDates,getReportsByDate,getReportById,updateReport,deleteReport } = require("../controllers/productionController");
const managerApprovedReportsController = require("../controllers/managerApprovedReportsController");
const verifyToken = require("../middleware/authMiddleware");
const checkRole = require("../middleware/roleMiddleware");
const permission = require("../middleware/permissionMiddleware");
const { expensiveUserLimiter } = require("../middleware/rateLimiters");
const notifyWorkerOnApprovedEdit = require("../middleware/notifyWorkerOnApprovedEdit");
const approvedReportEditLock = require("../middleware/approvedReportEditLock");
const { restoreApprovedReportVersion } = require("../services/approvedReportEditService");
const { publicMessage } = require("../utils/httpError");
const db = require("../config/db");
const ProductionTemp = require("../models/productionTempModel");

router.get("/dates",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_VIEW"),getReportDates);
router.get("/by-date",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_VIEW"),getReportsByDate);
router.get("/",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_VIEW"),managerApprovedReportsController.getApprovedReports);

router.post("/excel-sync",verifyToken,checkRole("admin","manager"),permission("EXCEL_DB_SYNC"),expensiveUserLimiter,(req,res,next)=>{try{const {syncExcelEdits}=require("../controllers/excelEditSyncController");if(typeof syncExcelEdits!=="function")return res.status(500).json({success:false,code:"EXCEL_SYNC_HANDLER_UNAVAILABLE",message:"Mô-đun đồng bộ Excel chưa sẵn sàng. Vui lòng triển khai lại backend mới nhất."});return syncExcelEdits(req,res,next);}catch(error){return next(error);}});

router.get("/:id",verifyToken,checkRole("admin","manager","lead","worker"),async(req,res,next)=>{
  const reportId=Number(req.params.id);
  if(!Number.isInteger(reportId)||reportId<=0)return res.status(400).json({success:false,message:"ID báo cáo không hợp lệ"});
  if(String(req.user?.role||"").toLowerCase()==="worker"){
    try{
      const [approvedRows]=await db.promise().query("SELECT id FROM production_reports WHERE id=? LIMIT 1",[reportId]);
      if(!approvedRows?.length){
        const tempReport=await ProductionTemp.getDetail(reportId);
        if(!tempReport)return res.status(404).json({success:false,message:"Không tìm thấy báo cáo"});
        if(Number(tempReport.worker_id)!==Number(req.user?.worker_id))return res.status(403).json({success:false,message:"Bạn không có quyền xem báo cáo này"});
        return res.json({success:true,data:tempReport});
      }
    }catch(error){console.error("GET WORKER REPORT DETAIL FALLBACK ERROR:",error);return res.status(error.status||500).json({success:false,message:publicMessage(error,"Không thể lấy chi tiết báo cáo")});}
    return getReportById(req,res,next);
  }

  const captured={statusCode:200,body:null,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  try{
    await getReportById(req,captured,next);
    if(captured.statusCode>=400||!captured.body?.success)return res.status(captured.statusCode||500).json(captured.body||{success:false,message:"Không thể lấy chi tiết báo cáo"});
    const data=captured.body.data||{};
    const sourceTempId=Number(data.source_temp_id||0);
    const currentDefects=Array.isArray(data.defects)?data.defects:[];
    const onlyUnclassified=currentDefects.length===1&&String(currentDefects[0]?.defect_code||"").trim().toUpperCase()==="NG_UNCLASSIFIED";
    const needsWorkerDefectFallback=Number(data.tt_ng||0)>0&&(currentDefects.length===0||onlyUnclassified);
    const approvedMachineLines=Array.isArray(data.machine_lines)?data.machine_lines:[];

    const hasDefectPayload=(line)=>{
      const direct=Array.isArray(line?.defects)?line.defects:[];
      if(direct.some(item=>Number(item?.quantity??item?.qty??item?.ng_quantity)>0))return true;
      let raw=line?.defects_json;
      if(typeof raw==="string"){
        try{raw=JSON.parse(raw||"[]");}catch{return false;}
      }
      if(Array.isArray(raw))return raw.some(item=>Number(item?.quantity??item?.qty??item?.ng_quantity)>0);
      if(raw&&typeof raw==="object"){
        if(Array.isArray(raw.defects))return raw.defects.some(item=>Number(item?.quantity??item?.qty??item?.ng_quantity)>0);
        return Object.entries(raw).some(([key,value])=>{
          if(["selectedDefects","selectedNg","total","ngQuantity"].includes(key))return false;
          return Number(typeof value==="object"&&value?(value.quantity??value.qty??value.ng_quantity):value)>0;
        });
      }
      return false;
    };

    const needsMachineDefectFallback=approvedMachineLines.some(line=>!hasDefectPayload(line));
    if(sourceTempId>0&&(needsWorkerDefectFallback||needsMachineDefectFallback||approvedMachineLines.length===0)){
      const temp=await ProductionTemp.getDetail(sourceTempId);
      if(temp){
        if(needsWorkerDefectFallback&&Array.isArray(temp.defects)&&temp.defects.length)data.defects=temp.defects;
        const tempLines=Array.isArray(temp.machine_lines)?temp.machine_lines:[];
        if(tempLines.length){
          if(approvedMachineLines.length){
            data.machine_lines=approvedMachineLines.map((line,index)=>{
              if(hasDefectPayload(line))return line;
              const sameKey=tempLines.find(candidate=>String(candidate?.machine_code||"").trim().toUpperCase()===String(line?.machine_code||"").trim().toUpperCase()&&String(candidate?.product_code||"").trim().toUpperCase()===String(line?.product_code||"").trim().toUpperCase());
              const sourceLine=sameKey||tempLines[index];
              if(!sourceLine)return line;
              const sourceDefects=Array.isArray(sourceLine.defects)?sourceLine.defects:[];
              if(!sourceDefects.length)return line;
              return {...line,defects:sourceDefects,defects_json:JSON.stringify(sourceDefects)};
            });
          }else{
            data.machine_lines=tempLines.map(line=>({...line,defects_json:line.defects_json||JSON.stringify(line.defects||[])}));
          }
        }
      }
    }
    return res.status(captured.statusCode).json(captured.body);
  }catch(error){console.error("GET APPROVED DETAIL WITH SOURCE TEMP FALLBACK ERROR:",error);return res.status(error.status||500).json({success:false,message:publicMessage(error,"Không thể lấy chi tiết báo cáo")});}
});

const restoreVersion=async(req,res)=>{const reportId=Number(req.params.id);const versionNo=Number(req.params.versionNo);try{const body=req.body&&typeof req.body==="object"?req.body:{};const expectedUpdatedAt=body.expected_updated_at||null;const reason=String(body.reason||body.change_reason||"").trim()||"Khôi phục phiên bản báo cáo đã duyệt";const result=await restoreApprovedReportVersion({reportId,versionNo,reason,userId:req.user.id,actor:req.user,req,expectedUpdatedAt});return res.json({success:true,message:"Khôi phục phiên bản thành công",data:result});}catch(error){console.error("RESTORE APPROVED REPORT VERSION ERROR:",error);return res.status(error.status||500).json({success:false,code:error.code,message:publicMessage(error,"Không thể khôi phục phiên bản báo cáo"),errors:error.details});}};
router.post("/:id/versions/:versionNo/restore",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_EDIT"),approvedReportEditLock,restoreVersion);
const ensureApprovedEditReason=(req,_res,next)=>{if(!req.body||typeof req.body!=="object")req.body={};req.body.reason=String(req.body.reason||req.body.change_reason||"").trim()||"Cập nhật báo cáo đã duyệt";next();};
router.put("/:id",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_APPROVED_EDIT"),ensureApprovedEditReason,approvedReportEditLock,notifyWorkerOnApprovedEdit,updateReport);
router.delete("/:id",verifyToken,checkRole("admin","manager","lead"),permission("REPORT_DELETE"),deleteReport);
module.exports=router;
