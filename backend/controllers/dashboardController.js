'use strict';
const {getDashboardSummary,clearDashboardCache}=require('../services/dashboardSummaryService');
exports.clearDashboardCache=clearDashboardCache;
exports.getSummary=async(req,res,next)=>{
  try {
    const {payload,cache}=await getDashboardSummary(req.user,req.query);
    res.setHeader("X-KTC-Cache",cache);
    return res.json(payload);
  } catch(error) {
    if(error.isPublic&&[400,404].includes(error.status))return res.status(error.status).json({success:false,message:error.message});
    return next(error);
  }
};
