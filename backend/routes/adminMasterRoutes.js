const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');

// /api/admin/master is also the master-data API used by the /manager workspace.
// Lead accounts are intentionally allowed here because Lead can operate the
// management workspace as Manager for master data. Do not rely on the generic
// MASTER_VIEW/MASTER_EDIT permission middleware for these four resources: a
// per-user override must not accidentally hide the manager workspace.
router.use(verifyToken);

const MANAGER_MASTER_RESOURCES=['machines','standards','defects','deductions'];
const SUPPORTING_READ_RESOURCES=['processes'];
const MANAGEMENT_ROLES=['admin','manager','lead'];
const normalizedRole=(req)=>String(req.user?.role||'').trim().toLowerCase();
const isManagementRole=(req)=>MANAGEMENT_ROLES.includes(normalizedRole(req));

const managerMasterAccess=(req,res,next)=>{
  const role=normalizedRole(req);
  const resource=String(req.params.resource||'');

  // All management roles can use the four manager master resources.
  // This is deliberately checked before permissionMiddleware so Lead using
  // /manager cannot be redirected/blocked by a stale permission override.
  if(isManagementRole(req)&&MANAGER_MASTER_RESOURCES.includes(resource)) return next();

  // Supporting process data is read-only for management roles.
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
  if(role==='manager'&&!MANAGER_MASTER_RESOURCES.includes(resource)){
    return res.status(403).json({success:false,code:'MASTER_RESOURCE_FORBIDDEN',message:'Quản lý chỉ được quản lý các danh mục master được phân quyền'});
  }
  if(role==='lead'&&!MANAGER_MASTER_RESOURCES.includes(resource)&&!(req.method==='GET'&&SUPPORTING_READ_RESOURCES.includes(resource))){
    return res.status(403).json({success:false,code:'MASTER_RESOURCE_FORBIDDEN',message:'Tổ trưởng chỉ được quản lý các danh mục master trong workspace quản lý'});
  }
  return next();
};

// adminMasterController still contains a legacy Lead guard that only lists
// three resources. For the defects resource, execute the controller with the
// same workspace role semantics as Manager. Process scope remains tied to the
// authenticated user's id, so this does not widen Lead's process scope.
const runAsManagerForLeadDefects=(handler)=>(req,res,next)=>{
  if(normalizedRole(req)!=='lead'||String(req.params.resource||'')!=='defects') return handler(req,res,next);
  const originalRole=req.user?.role;
  req.user.role='manager';
  return Promise.resolve(handler(req,res,next)).finally(()=>{ req.user.role=originalRole; });
};

// These routes intentionally use managerMasterAccess instead of the generic
// permission middleware. Lead/manager access is defined by workspace role here.
router.get('/transfer/export/:resource',managerMasterAccess,managerResourceScope,transferController.export);
router.post('/transfer/import/:resource',managerMasterAccess,managerResourceScope,transferController.import);
router.get('/:resource',managerMasterAccess,managerResourceScope,runAsManagerForLeadDefects(controller.list));
router.post('/:resource',managerMasterAccess,managerResourceScope,runAsManagerForLeadDefects(controller.create));
router.put('/:resource/:id',managerMasterAccess,managerResourceScope,runAsManagerForLeadDefects(controller.update));
router.delete('/:resource/:id',managerMasterAccess,managerResourceScope,runAsManagerForLeadDefects(controller.remove));

// Worker-specific master operations retain the normal permission guard.
router.put('/workers/:id/profile',checkRole('admin','manager','lead'),permission('MASTER_EDIT'),controller.updateWorker);
router.put('/workers/:id/processes',checkRole('admin','manager','lead'),permission('MASTER_EDIT'),controller.setWorkerProcesses);

module.exports=router;
