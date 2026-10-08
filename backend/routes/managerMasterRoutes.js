const express=require('express');
const router=express.Router();
const controller=require('../controllers/adminMasterController');
const transferController=require('../controllers/masterDataTransferController');
const verifyToken=require('../middleware/authMiddleware');
const checkRole=require('../middleware/roleMiddleware');
const permission=require('../middleware/permissionMiddleware');

router.use(verifyToken,checkRole('manager','lead'));
const masterAccess=permission('MASTER_VIEW','MASTER_EDIT');

router.get('/transfer/export/:resource',masterAccess,transferController.export);
router.post('/transfer/import/:resource',masterAccess,transferController.import);
router.get('/:resource',masterAccess,controller.list);
router.post('/:resource',masterAccess,controller.create);
router.put('/:resource/:id',masterAccess,controller.update);
router.delete('/:resource/:id',masterAccess,controller.remove);

module.exports=router;
