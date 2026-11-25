'use strict';
const db=require('../config/db');
const {getActorProcessScope,scopeSql}=require('./processAuthorizationService');
const {normalizeYearMonth}=require('../../shared/monthlyExcelContract.cjs');
const query=(sql,params)=>db.promise().query(sql,params).then(([rows])=>rows);
function monthRange(value){
  const yearMonth=normalizeYearMonth(value);
  const [year,month]=yearMonth.split('-').map(Number);
  const nextMonth=month===12?1:month+1;
  return {start:yearMonth+'-01',next:String(month===12?year+1:year).padStart(4,'0')+'-'+String(nextMonth).padStart(2,'0')+'-01'};
}
async function listProcessesForMonth(value, options = {}) {
  const yearMonth = normalizeYearMonth(value);
  const { start, next } = monthRange(yearMonth);
  const scope = options.actor ? await getActorProcessScope(options.actor) : { type:'ALL', processIds:null };
  const scoped = scopeSql(scope, 'p.id', [start, next]);
  const rows = await query(
    `SELECT p.id, p.process_code, p.process_name, COUNT(pr.id) AS report_count
       FROM processes p
       LEFT JOIN production_reports pr
         ON pr.process_id = p.id
        AND LOWER(TRIM(COALESCE(pr.status, ''))) = 'approved'
        AND NOT EXISTS (SELECT 1 FROM production_reports split_child WHERE JSON_UNQUOTE(JSON_EXTRACT(split_child.extra_data, '$.split_from_report_id')) = CAST(pr.id AS CHAR))
        AND pr.work_date >= ?
        AND pr.work_date < ?
      WHERE LOWER(COALESCE(p.status, 'active')) IN ('active', 'enabled', '1') ${scoped.clause}
      GROUP BY p.id, p.process_code, p.process_name
      ORDER BY CASE WHEN UPPER(p.process_code) = 'GC' THEN 0 ELSE 1 END, p.id`,
    scoped.params
  );

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    report_count: Number(row.report_count || 0)
  }));
}


module.exports={listProcessesForMonth,monthRange};
