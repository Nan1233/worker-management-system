const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const queue = require('../services/excelExportJobQueue');
const store = require('../services/excelExportJobStore');

const ALLOWED_TYPES = new Set(['process','company','company-all','monthly']);

exports.create = async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim();
    const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ success:false, code:'INVALID_EXCEL_JOB_TYPE', message:'Loại tác vụ Excel không hợp lệ' });
    const job = await queue.enqueue(type, payload, { requestedBy:req.user?.id, maxAttempts:Number(req.body?.maxAttempts || 3) });
    return res.status(202).json({ success:true, data:job, statusUrl:`/api/reports/export-excel/jobs/${job.id}`, downloadUrl:`/api/reports/export-excel/jobs/${job.id}/download` });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success:false, code:error.code || 'EXCEL_JOB_CREATE_FAILED', message:error.message });
  }
};

exports.list = async (req,res) => res.json({ success:true, data:await store.list(req.query?.limit) });

exports.get = async (req,res) => {
  const job=await store.get(String(req.params.jobId||''));
  if(!job)return res.status(404).json({success:false,code:'EXCEL_JOB_NOT_FOUND',message:'Không tìm thấy tác vụ Excel'});
  return res.json({success:true,data:job});
};

exports.download = async (req,res) => {
  const job=await store.get(String(req.params.jobId||''));
  if(!job)return res.status(404).json({success:false,code:'EXCEL_JOB_NOT_FOUND',message:'Không tìm thấy tác vụ Excel'});
  if(job.status!=='completed')return res.status(409).json({success:false,code:'EXCEL_JOB_NOT_READY',message:'Tác vụ Excel chưa hoàn thành',data:job});
  const filePath=job.result?.path || job.result?.archivePath;
  if(!filePath)return res.status(404).json({success:false,code:'EXCEL_FILE_NOT_FOUND',message:'Tác vụ không có file kết quả'});
  try {
    const stat=await fs.stat(filePath);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(job.result?.fileName || path.basename(filePath))}`);
    res.setHeader('Content-Length',String(stat.size));
    res.setHeader('Cache-Control','private, no-store');
    await pipeline(fsSync.createReadStream(filePath),res);
  } catch(error) {
    if(res.headersSent)return res.end();
    return res.status(404).json({success:false,code:'EXCEL_FILE_MISSING',message:'File kết quả không còn tồn tại'});
  }
};
