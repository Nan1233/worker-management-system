const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');
router.use(verifyToken,checkRole('admin','manager','lead'));

// Lead đang sử dụng workspace /manager nên có cùng quyền quản lý master
// với Manager đối với Máy móc, Sản phẩm & định mức, Lỗi NG và Trừ giờ.
const MANAGER_MASTER_RESOURCES=['machines','standards','defects','deductions'];
const SUPPORTING_READ_RESOURCES=['processes'];
const normalizedRole=(req)=>String(req.user?.role||'').trim().toLowerCase();
const isLeadManagerMasterResource=(req)=>normalizedRole(req)==='lead'&&MANAGER_MASTER_RESOURCES.includes(String(req.params.resource||''));

const managerResourceScope=(req,res,next)=>{
  const resource=String(req.params.resource||'');
  const role=normalizedRole(req);
  if((role==='manager'||role==='lead')&&req.method==='GET'&&SUPPORTING_READ_RESOURCES.includes(resource)) return next();
  if(role==='manager'&&!MANAGER_MASTER_RESOURCES.includes(resource)){
    return res.status(403).json({success:false,code:'MASTER_RESOURCE_FORBIDDEN',message:'Quản lý chỉ được quản lý các danh mục master được phân quyền'});
  }
  return next();
};

// Lead ở /manager được bypass permission riêng cho 4 master resource này.
const temporaryLeadManagerMasterAccess=(req,res,next)=>{
  if(isLeadManagerMasterResource(req)) return next();
  return permission(req.method==='GET'?'MASTER_VIEW':'MASTER_EDIT')(req,res,next);
};

router.get('/transfer/export/:resource',temporaryLeadManagerMasterAccess,managerResourceScope,transferController.export);
router.post('/transfer/import/:resource',temporaryLeadManagerMasterAccess,managerResourceScope,transferController.import);
router.get('/:resource',temporaryLeadManagerMasterAccess,managerResourceScope,controller.list);
router.post('/:resource',temporaryLeadManagerMasterAccess,managerResourceScope,controller.create);
router.put('/:resource/:id',temporaryLeadManagerMasterAccess,managerResourceScope,controller.update);
router.delete('/:resource/:id',temporaryLeadManagerMasterAccess,managerResourceScope,controller.remove);
router.put('/workers/:id/profile',permission('MASTER_EDIT'),controller.updateWorker);
router.put('/workers/:id/processes',permission('MASTER_EDIT'),controller.setWorkerProcesses);
module.exports=router;
