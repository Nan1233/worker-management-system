const express=require("express");
const router=express.Router();
const verifyToken=require("../middleware/authMiddleware");
const permission=require("../middleware/permissionMiddleware");
const checkRole=require("../middleware/roleMiddleware");
const controller=require("../controllers/defectController");
const { assertActorProcessAccess }=require("../services/processAuthorizationService");

const processAccess=(req,res,next)=>assertActorProcessAccess(req.user,req.params.id).then(()=>next()).catch(next);

router.get("/processes/:id/defects",verifyToken,checkRole("admin","manager","lead","worker"),permission("MASTER_VIEW","WORKER_ENTRY"),processAccess,controller.getDefectsByProcess);
module.exports=router;
