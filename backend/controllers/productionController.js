const db = require("../config/db");
const { mergeDefects, normalizeDeductions } = require("../utils/reportDetailNormalizer");
const { calculateReportPerformance } = require("../services/machinePerformanceService");
const { envEnabled } = require("../utils/featureFlags");
const { getActorProcessScope, assertProcessScope, scopeSql } = require('../services/processAuthorizationService');
const { hasPermission } = require('../services/permissionService');

const safeDbError = (res, error, fallback) => { console.error(fallback, error); return res.status(500).json({ success:false, message:process.env.NODE_ENV==='production'?fallback:(error?.message||fallback) }); };

exports.getAllReports=async(req,res)=>{try{const scope=await getActorProcessScope(req.user);const scoped=scopeSql(scope,'pr.process_id');const [rows]=await db.promise().query(`SELECT pr.*,p.process_name,w.worker_code,u.full_name,COALESCE(pr.training_percent_snapshot,w.training_percent,100) AS training_percent FROM production_reports pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id WHERE pr.status='approved'${scoped.clause} ORDER BY pr.created_at DESC`,scoped.params);return res.json(rows);}catch(error){if(error?.code==='PROCESS_SCOPE_FORBIDDEN')return res.status(403).json({success:false,code:error.code,message:error.message});return safeDbError(res,error,'Không thể tải dữ liệu báo cáo');}};

exports.getReportDates=async(req,res)=>{try{const scope=await getActorProcessScope(req.user);const scoped=scopeSql(scope,'pr.process_id');const [rows]=await db.promise().query(`SELECT DISTINCT pr.work_date FROM production_reports pr WHERE pr.status='approved'${scoped.clause} ORDER BY pr.work_date DESC`,scoped.params);return res.json(rows);}catch(error){if(error?.code==='PROCESS_SCOPE_FORBIDDEN')return res.status(403).json({success:false,code:error.code,message:error.message});return safeDbError(res,error,'Không thể tải ngày báo cáo');}};

exports.getReportsByDate=async(req,res)=>{try{const scope=await getActorProcessScope(req.user);if(req.query.process_id)await assertProcessScope(req.user,req.query.process_id,{action:'REPORT_APPROVED_VIEW'});const params=[req.query.date];let extra='';if(req.query.process_id){extra+=' AND pr.process_id=?';params.push(Number(req.query.process_id));}const scoped=scopeSql(scope,'pr.process_id',params);const [rows]=await db.promise().query(`SELECT pr.*,p.process_name,w.worker_code,u.full_name,COALESCE(pr.training_percent_snapshot,w.training_percent,100) AS training_percent FROM production_reports pr JOIN workers w ON pr.worker_id=w.id JOIN users u ON w.user_id=u.id JOIN processes p ON pr.process_id=p.id WHERE pr.work_date=? AND pr.status='approved'${extra}${scoped.clause} ORDER BY pr.created_at DESC`,scoped.params);return res.json(rows);}catch(error){if(error?.code==='PROCESS_SCOPE_FORBIDDEN')return res.status(403).json({success:false,code:error.code,message:error.message});return safeDbError(res,error,'Không thể tải dữ liệu báo cáo');}};

/**
 * Approved report detail.
 *
 * The list endpoint only needs the parent production_reports row, but the old
 * detail implementation executed six dependent queries in Promise.all().
 * On the Cloudflare/TiDB Serverless runtime, one incompatible/legacy optional
 * detail table could reject the whole request and make the UI unable to open
 * any report.
 *
 * Keep the parent report authoritative and load optional detail sections one
 * by one with isolated fallbacks. A missing/legacy auxiliary table must not
 * prevent the approved report itself from opening.
 */
exports.getReportById=async(req,res)=>{
  const reportId=Number(req.params.id);
  if(!Number.isInteger(reportId)||reportId<=0)return res.status(400).json({success:false,message:'ID báo cáo không hợp lệ'});

  try{
    const [minimalRows]=await db.promise().query('SELECT id,worker_id,process_id FROM production_reports WHERE id=? LIMIT 1',[reportId]);
    const minimal=minimalRows[0];
    if(!minimal)return res.status(404).json({success:false,message:'Không tìm thấy báo cáo'});

    const role=String(req.user?.role||'').toLowerCase();
    if(role==='worker'){
      if(Number(minimal.worker_id)!==Number(req.user?.worker_id))return res.status(403).json({success:false,message:'Bạn không có quyền xem báo cáo này'});
    }else if(['manager','lead'].includes(role)){
      if(!await hasPermission(req.user,'REPORT_APPROVED_VIEW'))return res.status(403).json({success:false,code:'PERMISSION_DENIED',message:'Bạn không có quyền xem báo cáo đã duyệt'});
      await assertProcessScope(req.user,minimal.process_id,{action:'REPORT_APPROVED_VIEW'});
    }

    const [reportRows]=await db.promise().query(
      `SELECT pr.*,p.process_name,w.worker_code,u.full_name,COALESCE(pr.training_percent_snapshot,w.training_percent,100) AS training_percent
         FROM production_reports pr
         JOIN workers w ON pr.worker_id=w.id
         JOIN users u ON w.user_id=u.id
         LEFT JOIN processes p ON pr.process_id=p.id
        WHERE pr.id=? LIMIT 1`,
      [reportId]
    );
    const report=reportRows[0];
    if(!report)return res.status(404).json({success:false,message:'Không tìm thấy báo cáo'});

    const optionalQuery=async(label,sql,params=[])=>{
      try{
        const [rows]=await db.promise().query(sql,params);
        return rows||[];
      }catch(error){
        console.warn(`GET APPROVED REPORT DETAIL OPTIONAL QUERY FAILED [${label}]`,error?.message||error);
        return [];
      }
    };

    const defects=await optionalQuery(
      'defects',
      `SELECT d.id,d.defect_type_id,dt.defect_code,dt.defect_name,d.quantity
         FROM production_report_defects d
         LEFT JOIN defect_types dt ON dt.id=d.defect_type_id
        WHERE d.report_id=?
        ORDER BY COALESCE(dt.sort_order,999999),d.id`,
      [reportId]
    );

    const deductions=await optionalQuery(
      'deductions',
      `SELECT d.id,d.deduction_type_id,dt.deduction_code,dt.deduction_name,d.hours
         FROM production_report_deductions d
         LEFT JOIN deduction_types dt ON dt.id=d.deduction_type_id
        WHERE d.report_id=?
        ORDER BY COALESCE(dt.sort_order,999999),d.id`,
      [reportId]
    );

    const machineLines=await optionalQuery(
      'machine-lines',
      `SELECT ml.id,ml.machine_event_id,ml.machine_id,ml.machine_code,ml.product_standard_id,ml.product_code,
              ml.machine_time_hours,ml.standard_output,ml.standard_source,ml.exclude_kqd_from_tt,
              ml.ok_quantity,ml.ng_quantity,ml.maximum_output,ml.counted_output,ml.earned_standard_hours,
              ml.defects_json,ml.sort_order
         FROM production_report_machine_lines ml
        WHERE ml.report_id=?
        ORDER BY ml.sort_order,ml.id`,
      [reportId]
    );

    const machineLineIds=machineLines.map(line=>Number(line.id)).filter(Number.isInteger);
    const eventIds=machineLines.map(line=>Number(line.machine_event_id)).filter(Number.isInteger);

    const persistedMachineDefects=machineLineIds.length
      ? await optionalQuery(
          'machine-defects',
          `SELECT md.id,md.machine_line_id,md.defect_type_id,md.defect_code,md.defect_name,md.quantity
             FROM production_report_machine_defects md
            WHERE md.machine_line_id IN (${machineLineIds.map(()=>'?').join(',')})
            ORDER BY md.machine_line_id,md.id`,
          machineLineIds
        )
      : [];

    const persistedEventDefects=eventIds.length
      ? await optionalQuery(
          'event-defects',
          `SELECT ed.id,ed.machine_event_id,ed.defect_type_id,ed.defect_code,ed.defect_name,ed.quantity
             FROM machine_production_event_defects ed
            WHERE ed.machine_event_id IN (${eventIds.map(()=>'?').join(',')})
            ORDER BY ed.machine_event_id,ed.id`,
          eventIds
        )
      : [];

    const eventDefectsByEvent=new Map();
    for(const defect of persistedEventDefects){
      const key=Number(defect.machine_event_id);
      if(!eventDefectsByEvent.has(key))eventDefectsByEvent.set(key,[]);
      eventDefectsByEvent.get(key).push({
        id:defect.id,
        defect_type_id:defect.defect_type_id,
        defect_code:defect.defect_code,
        defect_name:defect.defect_name,
        quantity:defect.quantity
      });
    }

    const machineDefectsByLine=new Map();
    for(const defect of persistedMachineDefects){
      const key=Number(defect.machine_line_id);
      if(!machineDefectsByLine.has(key))machineDefectsByLine.set(key,[]);
      machineDefectsByLine.get(key).push({
        id:defect.id,
        defect_type_id:defect.defect_type_id,
        defect_code:defect.defect_code,
        defect_name:defect.defect_name,
        quantity:defect.quantity
      });
    }

    const normalizedMachineLines=machineLines.map(line=>{
      const persisted=machineDefectsByLine.get(Number(line.id))||[];
      if(persisted.length)return {...line,defects:persisted,defects_json:JSON.stringify(persisted)};

      const existingFromLine=(()=>{
        let parsed=line?.defects;
        if(!Array.isArray(parsed))parsed=line?.defects_json;
        if(typeof parsed==='string'){
          try{parsed=JSON.parse(parsed);}catch{parsed=null;}
        }
        if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Array.isArray(parsed.defects))parsed=parsed.defects;
        return Array.isArray(parsed)?parsed.filter(item=>Number(item?.quantity||0)>0):[];
      })();
      if(existingFromLine.length)return {...line,defects:existingFromLine,defects_json:JSON.stringify(existingFromLine)};

      const eventDetails=eventDefectsByEvent.get(Number(line.machine_event_id))||[];
      if(eventDetails.length)return {...line,defects:eventDetails,defects_json:JSON.stringify(eventDetails)};
      return {...line,defects:[]};
    });

    let performance={};
    try{
      performance=calculateReportPerformance({report,machineLines:normalizedMachineLines});
    }catch(error){
      console.warn('GET APPROVED REPORT PERFORMANCE FALLBACK',error?.message||error);
      performance={performanceMode:'MANUAL',machine_lines:[],manualPerformance:null,machinePerformance:null,workerPerformance:null};
    }

    const mergedDefects=mergeDefects(report,defects,normalizedMachineLines);
    const normalizedDeductions=normalizeDeductions(deductions,report);

    return res.status(200).json({
      success:true,
      data:{
        ...report,
        defects:mergedDefects,
        deductions:normalizedDeductions,
        machine_lines:normalizedMachineLines,
        ...performance
      }
    });
  }catch(error){
    if(error?.code==='PROCESS_SCOPE_FORBIDDEN')return res.status(403).json({success:false,code:error.code,message:error.message});
    console.error('GET APPROVED REPORT DETAIL ERROR:',error);
    return res.status(500).json({
      success:false,
      message:process.env.NODE_ENV==='production'?'Không thể lấy chi tiết báo cáo':(error.message||'Không thể lấy chi tiết báo cáo')
    });
  }
};

const AuditService=require('../services/auditService');
const { publicMessage }=require('../utils/httpError');
const ReportGovernanceService=require('../services/reportGovernanceService');
const { updateApprovedReport,loadApprovedSnapshot,restoreApprovedReportVersion }=require('../services/approvedReportEditService');
const { createApprovedReportVersion }=require('../services/approvedVersionSnapshotService');
exports.updateReport=async(req,res)=>{const reportId=Number(req.params.id);try{const body=req.body&&typeof req.body==='object'?req.body:{};const expectedUpdatedAt=body.expected_updated_at;if(!expectedUpdatedAt)return res.status(428).json({success:false,code:'REPORT_VERSION_TOKEN_REQUIRED',message:'Báo cáo cần được tải lại trước khi lưu thay đổi.'});const {expected_updated_at:_expectedUpdatedAt,...patch}=body;const result=await updateApprovedReport({reportId,patch,reason:String(body.reason||'Cập nhật báo cáo').trim()||'Cập nhật báo cáo',userId:req.user.id,actor:req.user,req,expectedUpdatedAt,source:'web'});if(envEnabled('ENABLE_SERVER_HEAVY_EXCEL')&&envEnabled('ENABLE_EXCEL_EXPORT_WORKER'))await require('../services/excelExportJobQueue').enqueueMonthlyDates([result.before.work_date,result.report.work_date],req.user?.id);return res.json({success:true,message:'Cập nhật thành công',version:result.version,data:result.report});}catch(e){console.error('UPDATE APPROVED REPORT ERROR:',e);return res.status(e.status||500).json({success:false,code:e.code,message:publicMessage(e,'Không thể cập nhật báo cáo'),errors:e.details});}};
exports.deleteReport=async(req,res)=>{const reportId=Number(req.params.id);const deleteReason=String(req.body?.reason||'').trim().slice(0,500);if(!Number.isInteger(reportId)||reportId<=0)return res.status(422).json({success:false,message:'ID báo cáo không hợp lệ'});if(!deleteReason)return res.status(422).json({success:false,code:'DELETE_REASON_REQUIRED',message:'Vui lòng nhập lý do xóa báo cáo đã duyệt'});const connection=await db.promise().getConnection();try{await connection.beginTransaction();const [lockedRows]=await connection.query(`SELECT * FROM production_reports WHERE id=? FOR UPDATE`,[reportId]);if(!lockedRows[0]){await connection.rollback();return res.status(404).json({success:false,message:'Không tìm thấy báo cáo'});}await assertProcessScope(req.user,lockedRows[0].process_id,{executor:connection,action:'REPORT_DELETE'});const snapshot=await loadApprovedSnapshot(reportId,connection);const periodLocked=await ReportGovernanceService.isPeriodLocked(snapshot.work_date,snapshot.process_id,connection);if(periodLocked){await connection.rollback();return res.status(423).json({success:false,code:'REPORTING_PERIOD_LOCKED',message:'Kỳ báo cáo đã khóa, không thể xóa dữ liệu'});}await createApprovedReportVersion({reportId,reason:`Trước khi xóa: ${deleteReason}`,userId:req.user.id},connection);await connection.query(`UPDATE production_reports SET status='deleted',review_note=?,updated_by=?,updated_at=NOW() WHERE id=?`,[`Đã xóa: ${deleteReason}`,req.user.id,reportId]);const versionNo=await createApprovedReportVersion({reportId,reason:`Đã xóa: ${deleteReason}`,userId:req.user.id},connection);await AuditService.logActivity({userId:req.user.id,action:'REPORT_DELETED',entityType:'approved_report',entityId:reportId,description:'Xóa mềm báo cáo đã duyệt',metadata:{reason:deleteReason,version:versionNo,work_date:snapshot.work_date,process_id:snapshot.process_id},req},connection);await connection.commit();if(envEnabled('ENABLE_SERVER_HEAVY_EXCEL')&&envEnabled('ENABLE_EXCEL_EXPORT_WORKER'))await require('../services/excelExportJobQueue').enqueueMonthlyDates(snapshot.work_date,req.user?.id);return res.json({success:true,message:'Đã xóa báo cáo. Dữ liệu vẫn được giữ trong lịch sử để có thể khôi phục.',version:versionNo});}catch(e){await connection.rollback().catch(()=>{});console.error('DELETE REPORT ERROR:',e);return res.status(e.status||500).json({success:false,code:e.code,message:publicMessage(e,'Không thể xóa báo cáo')});}finally{connection.release();}};