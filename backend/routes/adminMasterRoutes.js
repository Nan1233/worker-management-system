const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');
router.use(verifyToken,checkRole('admin','manager','lead'));

const MANAGER_MASTER_RESOURCES=['machines','standards','deductions'];
const SUPPORTING_READ_RESOURCES=['processes'];
const normalizedRole=(req)=>String(req.user?.role||'').trim().toLowerCase();

const managerResourceScope=(req,res,next)=>{
  const resource=String(req.params.resource||'');
  const role=normalizedRole(req);

  // Manager/Lead đang dùng giao diện Manager cần đọc danh mục công đoạn
  // để các màn hình Máy móc/Sản phẩm/Trừ giờ nạp bộ lọc và dữ liệu liên quan.
  if((role==='manager'||role==='lead')&&req.method==='GET'&&SUPPORTING_READ_RESOURCES.includes(resource)){
    return next();
  }

  if(role==='manager'&&!MANAGER_MASTER_RESOURCES.includes(resource)){
    return res.status(403).json({
      success:false,
      code:'MASTER_RESOURCE_FORBIDDEN',
      message:'Quản lý chỉ được quản lý Máy móc, Sản phẩm và Trừ giờ; Nhân sự được quản lý tại màn hình Nhân sự theo công đoạn phụ trách'
    });
  }
  return next();
};

// Lead đang tạm sử dụng giao diện Manager. Trong thời gian này, Lead được
// đọc 3 master resource của Manager, kể cả khi quyền Lead có override.
// Quyền ghi vẫn phải qua MASTER_EDIT như bình thường.
const temporaryLeadManagerMasterView=(req,res,next)=>{
  const resource=String(req.params.resource||'');
  const role=normalizedRole(req);
  if(role==='lead'&&req.method==='GET'&&[
    ...MANAGER_MASTER_RESOURCES,
    ...SUPPORTING_READ_RESOURCES
  ].includes(resource)) return next();
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
