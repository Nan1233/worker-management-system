'use strict';

async function readApprovedReportIdentity(executor, reportId) {
    const [minimalRows]=await executor.query('SELECT id,worker_id,process_id FROM production_reports WHERE id=? LIMIT 1',[reportId]);
    const minimal=minimalRows[0];
    return minimal || null;
}
async function readApprovedReport(executor, reportId) {
    const [reportRows]=await executor.query(
      `SELECT pr.*,p.process_name,p.process_code,w.worker_code,u.full_name,CASE WHEN pr.training_percent_snapshot BETWEEN 0 AND 100 THEN pr.training_percent_snapshot ELSE NULL END AS training_percent
         FROM production_reports pr
         LEFT JOIN workers w ON pr.worker_id=w.id
         LEFT JOIN users u ON w.user_id=u.id
         LEFT JOIN processes p ON pr.process_id=p.id
        WHERE pr.id=? LIMIT 1`,
      [reportId]
    );
    const report=reportRows[0];
    return report || null;
}
async function readApprovedReportDetails(executor, reportId) {
    const optionalQuery=async(label,sql,params=[])=>{
      try{
        const [rows]=await executor.query(sql,params);
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
        const [rows]=await executor.query(
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

    return { defects, deductions, machineLines, machineLinesLoadFailed, persistedMachineDefects, persistedEventDefects };
}
module.exports = { readApprovedReportIdentity, readApprovedReport, readApprovedReportDetails };
