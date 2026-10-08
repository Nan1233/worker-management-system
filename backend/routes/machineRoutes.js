const express=require("express");
const router=express.Router();
const machineController=require("../controllers/machineController");
const verifyToken=require("../middleware/authMiddleware");
const permission=require("../middleware/permissionMiddleware");
const checkRole=require("../middleware/roleMiddleware");
const { assertActorProcessAccess }=require("../services/processAuthorizationService");

const processAccess=(req,res,next)=>assertActorProcessAccess(req.user,req.query.process_id)
  .then(()=>next()).catch(next);

router.get("/",verifyToken,checkRole("admin","manager","lead","worker"),permission("MASTER_VIEW","WORKER_ENTRY"),processAccess,machineController.getMachines);
module.exports=router;
