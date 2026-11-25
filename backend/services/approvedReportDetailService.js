'use strict';
const db = require('../config/db');
const { publicError } = require('../utils/httpError');
const { mergeDefects, normalizeDeductions, workerDeclaredDefects } = require('../utils/reportDetailNormalizer');
const { calculateReportPerformance } = require('./machinePerformanceService');
const { assertProcessScope, assertWorkerOwnership } = require('./processAuthorizationService');
const { hasPermission } = require('./permissionService');
const { projectApprovedReportKpi } = require('../domain/approvedReportKpi.cjs');

async function getApprovedReportDetail({ reportId, actor }) {
  if (!Number.isInteger(reportId) || reportId <= 0) throw publicError('ID báo cáo không hợp lệ', 400);
    const [minimalRows]=await db.promise().query('SELECT id,worker_id,process_id FROM production_reports WHERE id=? LIMIT 1',[reportId]);
    const minimal=minimalRows[0];
    if(!minimal)throw publicError('Không tìm thấy báo cáo',404);

    const role=String(actor?.role||'').toLowerCase();
    if(role==='worker'){
      assertWorkerOwnership(actor,minimal.worker_id);
    }else if(['manager','lead','admin_ops'].includes(role)){
      if(!await hasPermission(actor,'REPORT_APPROVED_VIEW'))throw publicError('Bạn không có quyền xem báo cáo đã duyệt',403,'PERMISSION_DENIED');
      await assertProcessScope(actor,minimal.process_id,{action:'REPORT_APPROVED_VIEW'});
    }

    const [reportRows]=await db.promise().query(
      `SELECT pr.*,p.process_name,p.process_code,w.worker_code,u.full_name,CASE WHEN pr.training_percent_snapshot BETWEEN 0 AND 100 THEN pr.training_percent_snapshot ELSE NULL END AS training_percent
         FROM production_reports pr
         LEFT JOIN workers w ON pr.worker_id=w.id
         LEFT JOIN users u ON w.user_id=u.id
         LEFT JOIN processes p ON pr.process_id=p.id
        WHERE pr.id=? LIMIT 1`,
      [reportId]
    );
    const report=reportRows[0];
    if(!report)throw publicError('Không tìm thấy báo cáo',404);

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

    // `ml.*` so every persisted per-line column (deduction_time_hours, deductions_json, standard_* ids, ...)
    // reaches the edit form; a hand-written column list previously dropped the deduction columns.
    let machineLinesLoadFailed=false;
    const machineLines=await (async()=>{
      try{
        const [rows]=await db.promise().query(
          `SELECT ml.* FROM production_report_machine_lines ml WHERE ml.report_id=? ORDER BY ml.sort_order,ml.id`,
          [reportId]
        );
        return rows||[];
      }catch(error){
        machineLinesLoadFailed=true;
        console.warn('GET APPROVED REPORT DETAIL MACHINE LINES FAILED',error?.message||error);
        return [];
      }
    })();

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
          `SELECT ed.id,ed.machine_event_id,ed.defect_type_id,ed.defect_code,ed.defect_name,ed.quantity,ed.responsible_worker_id
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
        quantity:defect.quantity,
        responsible_worker_id:defect.responsible_worker_id
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

      const eventDetails=(eventDefectsByEvent.get(Number(line.machine_event_id))||[]).filter(defect=>defect.responsible_worker_id != null && Number(defect.responsible_worker_id)===Number(report.worker_id));
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

    const kpi=projectApprovedReportKpi({...report,machine_lines:normalizedMachineLines,deductions:normalizedDeductions,defects:mergedDefects});

    return {
        ...report,
        defects:mergedDefects,
        worker_defects:workerDeclaredDefects(defects),
        deductions:normalizedDeductions,
        ...(machineLinesLoadFailed?{machine_lines_load_failed:true}:{}),
        ...performance,
        machine_lines:normalizedMachineLines,
        kpi
    };
}
module.exports = { getApprovedReportDetail };
