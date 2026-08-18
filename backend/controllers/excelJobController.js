const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const queue = require('../services/excelExportJobQueue');
const store = require('../services/excelExportJobStore');
const db = require('../config/db');
const { assertProcessScope, assertProcessesScope } = require('../services/processAuthorizationService');

const ALLOWED_TYPES = new Set(['process','company','company-all','monthly']);

const COMPANY_CODES=['CAN','EP','XLBV','GC','MAI','DO','K1','K2','SX3'];
async function idsByCodes(codes){const vals=[...new Set((codes||[]).map((v)=>String(v||'').toUpperCase()).filter(Boolean))];if(!vals.length)return[];const [rows]=await db.promise().query(`SELECT id FROM processes WHERE UPPER(process_code) IN (${vals.map(()=>'?').join(',')})`,vals);return rows.map((r)=>Number(r.id)).filter(Boolean);}
async function authorizeJobRequest(actor,type,payload){
  if(type==='process') return assertProcessScope(actor,Number(payload.processId),{action:'EXCEL_JOB_CREATE'});
  if(type==='company' && payload.groupCode){const {GROUPS}=require('../services/companyExcelExportService');const group=GROUPS[String(payload.groupCode).toUpperCase()];if(!group){const e=new Error('Nhóm file Excel không hợp lệ');e.status=400;throw e;}return assertProcessesScope(actor,await idsByCodes(group.processCodes),{action:'EXCEL_JOB_CREATE'});}
  if(['company-all','monthly','company'].includes(type)) return assertProcessesScope(actor,await idsByCodes(COMPANY_CODES),{action:'EXCEL_JOB_CREATE'});
}
function ownsJob(actor,job){return actor?.role==='admin'||Number(job?.requestedBy)===Number(actor?.id);}
async function canReadJob(actor,job){if(!ownsJob(actor,job))return false;try{await authorizeJobRequest(actor,job.type,job.payload||{});return true;}catch(error){if(error?.status===403||error?.statusCode===403)return false;throw error;}}


exports.create = async (req, res) => {
  try {
    const type = String(req.body?.type || '').trim();
    const payload = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : {};
    if (!ALLOWED_TYPES.has(type)) return res.status(400).json({ success:false, code:'INVALID_EXCEL_JOB_TYPE', message:'Loại tác vụ Excel không hợp lệ' });
    await authorizeJobRequest(req.user,type,payload);
    const job = await queue.enqueue(type, payload, { requestedBy:req.user?.id, maxAttempts:Number(req.body?.maxAttempts || 3) });
    return res.status(202).json({ success:true, data:job, statusUrl:`/api/reports/export-excel/jobs/${job.id}`, downloadUrl:`/api/reports/export-excel/jobs/${job.id}/download` });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ success:false, code:error.code || 'EXCEL_JOB_CREATE_FAILED', message:error.message });
  }
};

exports.list = async (req,res) => { const jobs=await store.list(req.query?.limit); if(req.user?.role==='admin')return res.json({success:true,data:jobs}); const visible=[]; for(const job of jobs){if(await canReadJob(req.user,job))visible.push(job);} return res.json({success:true,data:visible}); };

exports.get = async (req,res) => {
  const job=await store.get(String(req.params.jobId||''));
  if(!job)return res.status(404).json({success:false,code:'EXCEL_JOB_NOT_FOUND',message:'Không tìm thấy tác vụ Excel'});
  if(!await canReadJob(req.user,job))return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Bạn không có quyền truy cập tác vụ Excel này'});
  return res.json({success:true,data:job});
};

exports.download = async (req,res) => {
  const job=await store.get(String(req.params.jobId||''));
  if(!job)return res.status(404).json({success:false,code:'EXCEL_JOB_NOT_FOUND',message:'Không tìm thấy tác vụ Excel'});
  if(!await canReadJob(req.user,job))return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Bạn không có quyền truy cập tác vụ Excel này'});
  if(job.status!=='completed')return res.status(409).json({success:false,code:'EXCEL_JOB_NOT_READY',message:'Tác vụ Excel chưa hoàn thành',data:job});
  const filePath=job.result?.path || job.result?.archivePath;
  if(!filePath)return res.status(404).json({success:false,code:'EXCEL_FILE_NOT_FOUND',message:'Tác vụ không có file kết quả'});
  try {
    const stat=await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) {
      return res.status(404).json({success:false,code:'EXCEL_FILE_INVALID',message:'File kết quả không hợp lệ'});
    }
    const extension = path.extname(filePath).toLowerCase();
    const contentType = extension === '.zip'
      ? 'application/zip'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(job.result?.fileName || path.basename(filePath))}`);
    res.setHeader('Content-Length',String(stat.size));
    res.setHeader('Cache-Control','private, no-store');
    await pipeline(fsSync.createReadStream(filePath),res);
  } catch(error) {
    if(res.headersSent)return res.end();
    return res.status(404).json({success:false,code:'EXCEL_FILE_MISSING',message:'File kết quả không còn tồn tại'});
  }
};
