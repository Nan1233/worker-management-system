const express=require("express");
const router=express.Router();
const controller=require("../controllers/productStandardController");
const verifyToken=require("../middleware/authMiddleware");
const permission=require("../middleware/permissionMiddleware");
const checkRole=require("../middleware/roleMiddleware");
const db=require("../config/db");
const { assertActorProcessAccess }=require("../services/processAuthorizationService");

// Worker UI may request master data by process_code (e.g. ?process_code=DO)
// or process_id. Resolve the code to the canonical DB ID before enforcing scope.
const processAccess=async(req,res,next)=>{
  try {
    let processId=Number(req.query.process_id);
    if (!Number.isInteger(processId) || processId <= 0) {
      const processCode=String(req.query.process_code || "").trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,20}$/.test(processCode)) {
        return res.status(400).json({success:false,code:"PROCESS_ID_REQUIRED",message:"Cần process_id hoặc process_code hợp lệ"});
      }
      const [rows]=await db.promise().query(
        "SELECT id FROM processes WHERE UPPER(TRIM(process_code))=? AND status IN ('active','enabled','1') ORDER BY id LIMIT 1",
        [processCode]
      );
      processId=Number(rows?.[0]?.id);
    }
    if (!Number.isInteger(processId) || processId <= 0) {
      return res.status(400).json({success:false,code:"PROCESS_NOT_FOUND",message:"Không tìm thấy công đoạn"});
    }
    req.resolvedProcessId=processId;
    await assertActorProcessAccess(req.user,processId);
    return next();
  } catch(error) {
    return next(error);
  }
};

router.get("/resolve",verifyToken,checkRole("admin","manager","lead","worker"),permission("MASTER_VIEW","WORKER_ENTRY"),processAccess,controller.resolveProductStandard);
router.get("/",verifyToken,checkRole("admin","manager","lead","worker"),permission("MASTER_VIEW","WORKER_ENTRY"),processAccess,controller.getProductStandards);
module.exports=router;
