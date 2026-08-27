const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');

const RESOURCES=['machines','standards','deductions'];
const isManagerMaster=(req)=>RESOURCES.includes(String(req.params.resource||''));

router.use(verifyToken,checkRole('manager','lead'));

// Lead currently uses the Manager workspace. Keep these three Manager master
// resources available to Lead without depending on per-user MASTER_* overrides.
const masterAccess=(req,res,next)=>{
  if(isManagerMaster(req)) return next();
  return permission(req.method==='GET'?'MASTER_VIEW':'MASTER_EDIT')(req,res,next);
};

router.get('/transfer/export/:resource',masterAccess,transferController.export);
router.post('/transfer/import/:resource',masterAccess,transferController.import);
router.get('/:resource',masterAccess,controller.list);
router.post('/:resource',masterAccess,controller.create);
router.put('/:resource/:id',masterAccess,controller.update);
router.delete('/:resource/:id',masterAccess,controller.remove);

module.exports=router;
