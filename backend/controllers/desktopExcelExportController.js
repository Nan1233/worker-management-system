const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { pipeline } = require('node:stream/promises');
const excelJobManager = require('../services/excelExportJobManager');

function sendJobError(res, error, fallback) {
  if (res.headersSent) return res.end();
  return res.status(error?.statusCode || 500).json({
    success:false, code:error?.code || 'EXCEL_EXPORT_FAILED', jobId:error?.jobId || null,
    activeJob:error?.activeJob || null, message:error?.message || fallback
  });
}

exports.listProcesses = async (req,res) => {
  try {
    const selectedDate=String(req.query?.date||'').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))return res.status(400).json({success:false,message:'Ngày đồng bộ Excel không hợp lệ'});
    const { listProcessesForMonth }=require('../services/processExcelExportService');
    const rows=await listProcessesForMonth(selectedDate.slice(0,7));
    return res.json({success:true,data:rows.map(row=>({id:Number(row.id),processCode:row.process_code||'',processName:row.process_name||`Công đoạn ${row.id}`,reportCount:Number(row.report_count)||0}))});
  } catch(error){console.error('LIST DESKTOP EXCEL PROCESSES ERROR:',error);return res.status(500).json({success:false,message:'Không thể lấy danh sách công đoạn Excel'});}
};

exports.exportProcess = async (req,res) => {
  if(String(process.env.ENABLE_PROCESS_EXCEL_EXPORT??'false').trim().toLowerCase()!=='true')return res.status(503).json({success:false,code:'PROCESS_EXCEL_DISABLED',message:'Xuất báo cáo Excel theo công đoạn đang bị tắt trên máy chủ.'});
  const selectedDate=String(req.body?.date||'').trim(); const processId=Number(req.body?.processId);
  try {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)||!Number.isInteger(processId)||processId<=0)return res.status(400).json({success:false,message:'Ngày hoặc công đoạn xuất Excel không hợp lệ'});
    const yearMonth=selectedDate.slice(0,7);
    // Luôn tạo workbook cho công đoạn đang hoạt động, kể cả tháng chưa có
    // báo cáo đã duyệt. Service sẽ dựng file mẫu rỗng đúng kỳ.
    const result=await excelJobManager.run('process',{yearMonth,processId});
    const stat=await fs.stat(result.path); res.status(200);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    res.setHeader('Content-Length',String(stat.size));res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Access-Control-Expose-Headers','Content-Disposition, X-KTC-Process-Name');res.setHeader('X-KTC-Process-Name',encodeURIComponent(result.processName));
    await pipeline(fsSync.createReadStream(result.path),res);
  } catch(error){console.error('EXPORT DESKTOP PROCESS EXCEL ERROR:',error);return sendJobError(res,error,'Không thể tạo file Excel công đoạn');}
};

exports.listCompanyFiles = async (req,res) => {
  try { const selectedDate=String(req.query?.date||'').trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))return res.status(400).json({success:false,message:'Ngày xuất Excel không hợp lệ'}); const {listCompanyFiles}=require('../services/companyExcelExportService'); return res.json({success:true,data:await listCompanyFiles(selectedDate.slice(0,7))}); }
  catch(error){console.error('LIST COMPANY EXCEL FILES ERROR:',error);return res.status(500).json({success:false,message:'Không thể lấy danh sách file báo cáo công ty'});}
};

exports.buildAllCompanyFiles = async (req,res) => {
  const selectedDate=String(req.body?.date||req.query?.date||'').trim(); if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate))return res.status(400).json({success:false,message:'Ngày xuất Excel không hợp lệ'});
  try { const result=await excelJobManager.run('company-all',{yearMonth:selectedDate.slice(0,7)}); return res.json({success:true,data:result}); }
  catch(error){return sendJobError(res,error,'Không thể tạo đầy đủ file báo cáo công ty');}
};

exports.exportCompanyFile = async (req,res) => {
  if(String(process.env.ENABLE_SERVER_COMPANY_EXCEL||'').toLowerCase()!=='true')return res.status(503).json({success:false,code:'DESKTOP_EXCEL_REQUIRED',message:'Workbook công ty được tạo trên Desktop để bảo vệ RAM Render Free.'});
  const selectedDate=String(req.body?.date||'').trim();const groupCode=String(req.body?.groupCode||'').trim().toUpperCase();
  try {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)||!groupCode)return res.status(400).json({success:false,message:'Ngày hoặc nhóm file Excel không hợp lệ'});
    const result=await excelJobManager.run('company',{yearMonth:selectedDate.slice(0,7),groupCode});const stat=await fs.stat(result.path);
    res.status(200);res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);res.setHeader('Content-Length',String(stat.size));res.setHeader('Cache-Control','private, no-store');res.setHeader('Access-Control-Expose-Headers','Content-Disposition, X-KTC-Report-Group');res.setHeader('X-KTC-Report-Group',encodeURIComponent(result.groupTitle||groupCode));await pipeline(fsSync.createReadStream(result.path),res);
  } catch(error){console.error('EXPORT COMPANY EXCEL FILE ERROR:',error);return sendJobError(res,error,'Không thể tạo file báo cáo công ty');}
};
