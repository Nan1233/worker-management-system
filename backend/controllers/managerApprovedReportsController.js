'use strict';
const { listApprovedReports } = require('../services/approvedReportListService');

exports.getApprovedReports = async (req, res) => {
  try {
    return res.json(await listApprovedReports({actor:req.user,query:req.query}));
  } catch (error) {
    if (error?.code === 'PROCESS_SCOPE_FORBIDDEN') return res.status(403).json({success:false,code:error.code,message:error.message});
    if (error?.status === 400 && error.isPublic) return res.status(400).json({success:false,code:error.code,message:error.message});
    console.error('GET MANAGER APPROVED REPORTS ERROR:', error);
    return res.status(500).json({success:false,code:'APPROVED_REPORTS_QUERY_FAILED',message:'Không thể tải báo cáo đã duyệt'});
  }
};
