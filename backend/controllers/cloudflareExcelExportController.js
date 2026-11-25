'use strict';
// Compatibility endpoints intentionally never forward an Authorization header
// to a remote rendering service. Cloudflare serves approved JSON only.
function desktopRequired(req,res){
  return res.status(503).json({success:false,code:'DESKTOP_EXCEL_REQUIRED',message:'Vui lòng xuất Excel bằng ứng dụng Desktop.'});
}
module.exports={exportGiaCongExcel:desktopRequired,exportProcess:desktopRequired};
