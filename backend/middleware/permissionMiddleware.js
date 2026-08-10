const { hasPermission } = require('../services/permissionService');
module.exports = (...codes) => async (req,res,next) => {
  if (!req.user) return res.status(401).json({success:false,code:'AUTH_REQUIRED',message:'Chưa xác thực'});
  try {
    for (const code of codes) if (await hasPermission(req.user,code)) return next();
    return res.status(403).json({success:false,code:'PERMISSION_DENIED',message:'Bạn không có quyền thực hiện chức năng này',requiredPermissions:codes});
  } catch (error) { next(error); }
};
