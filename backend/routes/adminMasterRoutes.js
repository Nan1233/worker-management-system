const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');

// /api/admin/master is the master-data API used by the management workspace.
// Manager and Lead have the same CRUD capability for machines, standards and
// deductions. Process scope is still enforced by the controller/service.
router.use(verifyToken);

const MANAGER_MASTER_RESOURCES=['machines','standards','deductions'];
const MANAGER_ONLY_MASTER_RESOURCES=['defects'];
const SUPPORTING_READ_RESOURCES=['processes'];
const MANAGEMENT_ROLES=['admin','manager','lead'];
const normalizedRole=(req)=>String(req.user?.role||'').trim().toLowerCase();
const isManagementRole=(req)=>MANAGEMENT_ROLES.includes(normalizedRole(req));

const managerMasterAccess=(req,res,next)=>{
  const role=normalizedRole(req);
  const resource=String(req.params.resource||'');

  // Manager and Lead can CRUD the three agreed master resources.
  if(isManagementRole(req)&&MANAGER_MASTER_RESOURCES.includes(resource)) return next();

  // Defect master remains Manager/Admin only.
  if((role==='admin'||role==='manager')&&MANAGER_ONLY_MASTER_RESOURCES.includes(resource)) return next();

  // Process data is supporting read-only data for the management workspace.
  if(isManagementRole(req)&&req.method==='GET'&&SUPPORTING_READ_RESOURCES.includes(resource)) return next();

  return res.status(403).json({
    success:false,
    code:'MASTER_RESOURCE_FORBIDDEN',
    message:'Bạn không có quyền truy cập danh mục này'
  });
};

const managerResourceScope=(req,res,next)=>{
  const resource=String(req.params.resource||'');
  const role=normalizedRole(req);
  if((role==='manager'||role==='lead')&&req.method==='GET'&&SUPPORTING_READ_RESOURCES.includes(resource)) return next();
  if(role==='manager'&&(!MANAGER_MASTER_RESOURCES.includes(resource)&&!MANAGER_ONLY_MASTER_RESOURCES.includes(resource))){
    return res.status(403).json({success:false,code:'MASTER_RESOURCE_FORBIDDEN',message:'Quản lý chỉ được quản lý các danh mục master được phân quyền'});
  }
  if(role==='lead'&&!MANAGER_MASTER_RESOURCES.includes(resource)&&!(req.method==='GET'&&SUPPORTING_READ_RESOURCES.includes(resource))){
    return res.status(403).json({success:false,code:'MASTER_RESOURCE_FORBIDDEN',message:'Tổ trưởng chỉ được quản lý Máy móc, Sản phẩm và Trừ giờ'});
  }
  return next();
};

// Keep the controller's process-scope and validation logic intact. Lead is
// already authorized by the shared MASTER permissions for the three resources.
router.get('/transfer/export/:resource',managerMasterAccess,managerResourceScope,transferController.export);
router.post('/transfer/import/:resource',managerMasterAccess,managerResourceScope,transferController.import);
router.get('/:resource',managerMasterAccess,managerResourceScope,controller.list);
router.post('/:resource',managerMasterAccess,managerResourceScope,controller.create);
router.put('/:resource/:id',managerMasterAccess,managerResourceScope,controller.update);
router.delete('/:resource/:id',managerMasterAccess,managerResourceScope,controller.remove);

// Worker-specific master operations retain the normal permission guard.
router.put('/workers/:id/profile',checkRole('admin','manager','lead'),permission('MASTER_EDIT'),controller.updateWorker);
router.put('/workers/:id/processes',checkRole('admin','manager','lead'),permission('MASTER_EDIT'),controller.setWorkerProcesses);

module.exports=router;
