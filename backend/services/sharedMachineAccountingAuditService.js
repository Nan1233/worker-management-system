const db=require('../config/db');
function q(sql,params=[]){return db.promise().query(sql,params).then(([rows])=>rows);}
async function scan(){
  const rows=await q(`SELECT r.work_date,r.shift,r.process_id,ml.machine_id,ml.machine_code,
      COUNT(DISTINCT r.worker_id) worker_count,COUNT(*) line_count,
      GROUP_CONCAT(DISTINCT ml.product_code ORDER BY ml.product_code SEPARATOR ',') products,
      SUM(ml.counted_output) worker_credited_output,SUM(ml.maximum_output) legacy_capacity,
      SUM(ml.machine_time_hours) participation_hours,
      SUM(CASE WHEN ml.machine_event_id IS NULL THEN 1 ELSE 0 END) unlinked_lines
    FROM production_report_machine_lines ml JOIN production_reports r ON r.id=ml.report_id
    WHERE r.status='approved'
    GROUP BY r.work_date,r.shift,r.process_id,ml.machine_id,ml.machine_code
    HAVING COUNT(DISTINCT r.worker_id)>1 OR SUM(CASE WHEN ml.machine_event_id IS NULL THEN 1 ELSE 0 END)>0
    ORDER BY r.work_date DESC,ml.machine_code`);
  return rows.map((row)=>{
    const findings=[];
    if(Number(row.unlinked_lines)>0) findings.push('SHARED_MACHINE_EVENT_UNKNOWN','SHARED_MACHINE_ALLOCATION_UNKNOWN');
    if(Number(row.worker_count)>1){findings.push('SHARED_MACHINE_DUPLICATE_OUTPUT_RISK','SHARED_MACHINE_CAPACITY_DOUBLE_COUNT','SHARED_MACHINE_OVERLAP_AMBIGUOUS');}
    return {...row,classification:Number(row.unlinked_lines)>0?'REVIEW_REQUIRED':'REVIEW_REQUIRED',findings:[...new Set(findings)]};
  });
}
module.exports={scan};
