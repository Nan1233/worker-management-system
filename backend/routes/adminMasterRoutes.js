const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');
router.use(verifyToken,checkRole('admin','manager','lead'));
const managerResourceScope=(req,res,next)=>{
  if(req.user?.role==='manager'&&!['machines','standards','deductions'].includes(String(req.params.resource||''))){
    return res.status(403).json({success:false,code:'MASTER_RESOURCE_FORBIDDEN',message:'Quản lý chỉ được quản lý Máy móc, Sản phẩm và Trừ giờ; Nhân sự được quản lý tại màn hình Nhân sự theo công đoạn phụ trách'});
  }
  return next();
};
// Lead đang tạm sử dụng giao diện Manager. Trong thời gian này, Lead phải truy cập
// được 3 master resource mà Manager được phép xem, kể cả khi quyền Lead có override.
const temporaryLeadManagerMasterView=(req,res,next)=>{
  const resource=String(req.params.resource||'');
  if(req.user?.role==='lead'&&req.method==='GET'&&['machines','standards','deductions'].includes(resource)) return next();
  return permission('MASTER_VIEW')(req,res,next);
};
router.get('/transfer/export/:resource',permission('MASTER_VIEW'),managerResourceScope,transferController.export);
router.post('/transfer/import/:resource',permission('MASTER_EDIT'),managerResourceScope,transferController.import);
router.get('/:resource',temporaryLeadManagerMasterView,managerResourceScope,controller.list);
router.post('/:resource',permission('MASTER_EDIT'),managerResourceScope,controller.create);
router.put('/:resource/:id',permission('MASTER_EDIT'),managerResourceScope,controller.update);
router.delete('/:resource/:id',permission('MASTER_EDIT'),managerResourceScope,controller.remove);
router.put('/workers/:id/profile',permission('MASTER_EDIT'),controller.updateWorker);
router.put('/workers/:id/processes',permission('MASTER_EDIT'),controller.setWorkerProcesses);
module.exports=router;
