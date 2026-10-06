const express=require("express");
const router=express.Router();
const controller=require("../controllers/productStandardController");
const verifyToken=require("../middleware/authMiddleware");
const permission=require("../middleware/permissionMiddleware");
const checkRole=require("../middleware/roleMiddleware");
const { assertActorProcessAccess }=require("../services/processAuthorizationService");

const processAccess=(req,res,next)=>{
  const processId=req.query.process_id;
  return assertActorProcessAccess(req.user,processId).then(()=>next()).catch(next);
};

router.get("/resolve",verifyToken,checkRole("admin","manager","lead","worker"),permission("MASTER_VIEW","WORKER_ENTRY"),processAccess,controller.resolveProductStandard);
router.get("/",verifyToken,checkRole("admin","manager","lead","worker"),permission("MASTER_VIEW","WORKER_ENTRY"),processAccess,controller.getProductStandards);
module.exports=router;
