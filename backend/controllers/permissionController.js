const db = require('../config/db');
const service = require('../services/permissionService');

exports.me = async (req,res,next) => { try { const permissions=[...(await service.getEffectivePermissions(req.user))]; res.json({success:true,data:{permissions}}); } catch(e){next(e);} };
exports.matrix = async (req,res,next) => { try {
  const matrix=await service.getAdminMatrix();
  const [users]=await db.promise().query(`SELECT id,username,full_name,role,status FROM users ORDER BY FIELD(role,'admin','manager','lead','worker'),full_name,username`);
  res.json({success:true,data:{...matrix,users}});
} catch(e){next(e);} };
exports.setRole = async (req,res,next) => { try { await service.setRoleOverride(req.params.role,req.params.code,req.body?.allowed ?? null); res.json({success:true}); } catch(e){if(e.status)return res.status(e.status).json({success:false,message:e.message});next(e);} };
exports.setUser = async (req,res,next) => { try { await service.setUserOverride(req.params.userId,req.params.code,req.body?.allowed ?? null); res.json({success:true}); } catch(e){if(e.status)return res.status(e.status).json({success:false,message:e.message});next(e);} };
