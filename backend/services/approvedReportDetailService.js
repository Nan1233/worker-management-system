'use strict';
const db = require('../config/db');
const { readApprovedReportIdentity, readApprovedReport, readApprovedReportDetails } = require('../repositories/approvedReportDetailRepository');
const { normalizeApprovedMachineLines } = require('../domain/approvedMachineLineNormalization');
const { publicError } = require('../utils/httpError');
const { mergeDefects, normalizeDeductions, workerDeclaredDefects } = require('../utils/reportDetailNormalizer');
const { calculateReportPerformance } = require('./machinePerformanceService');
const { assertProcessScope, assertWorkerOwnership } = require('./processAuthorizationService');
const { hasPermission } = require('./permissionService');
const { projectApprovedReportKpi } = require('../domain/approvedReportKpi.cjs');

async function getApprovedReportDetail({ reportId, actor }) {
  if (!Number.isInteger(reportId) || reportId <= 0) throw publicError('ID báo cáo không hợp lệ', 400);
    const minimal=await readApprovedReportIdentity(db.promise(),reportId);
    if(!minimal)throw publicError('Không tìm thấy báo cáo',404);

    const role=String(actor?.role||'').toLowerCase();
    if(role==='worker'){
      assertWorkerOwnership(actor,minimal.worker_id);
    }else if(['manager','lead','admin_ops'].includes(role)){
      if(!await hasPermission(actor,'REPORT_APPROVED_VIEW'))throw publicError('Bạn không có quyền xem báo cáo đã duyệt',403,'PERMISSION_DENIED');
      await assertProcessScope(actor,minimal.process_id,{action:'REPORT_APPROVED_VIEW'});
    }

    const report=await readApprovedReport(db.promise(),reportId);
    if(!report)throw publicError('Không tìm thấy báo cáo',404);

    const { defects, deductions, machineLines, machineLinesLoadFailed, persistedMachineDefects, persistedEventDefects } = await readApprovedReportDetails(db.promise(),reportId);
    const normalizedMachineLines=normalizeApprovedMachineLines({report,machineLines,persistedMachineDefects,persistedEventDefects});

    let performance={};
    try{
      performance=calculateReportPerformance({report,machineLines:normalizedMachineLines});
    }catch(error){
      console.warn('GET APPROVED REPORT PERFORMANCE FALLBACK',error?.message||error);
      performance={performanceMode:'MANUAL',machine_lines:[],manualPerformance:null,machinePerformance:null,workerPerformance:null};
    }

    const mergedDefects=mergeDefects(report,defects,normalizedMachineLines);
    const normalizedDeductions=normalizeDeductions(deductions,report);

    const kpi=projectApprovedReportKpi({...report,machine_lines:machineLines,deductions,defects});

    return {
        ...report,
        defects:mergedDefects,
        worker_defects:workerDeclaredDefects(defects),
        deductions:normalizedDeductions,
        ...(machineLinesLoadFailed?{machine_lines_load_failed:true}:{}),
        ...performance,
        machine_lines:normalizedMachineLines,
        tt_dinh_muc:kpi.plannedOutput,
        kpi
    };
}
module.exports = { getApprovedReportDetail };
