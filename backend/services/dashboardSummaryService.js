'use strict';
const db=require('../config/db');
const {TtlCache}=require('../utils/cache');
const {publicError}=require('../utils/httpError');
const {readDashboardSummary,canReadDashboardProcess}=require('../repositories/dashboardSummaryRepository');
const {projectDashboardSummary}=require('../domain/dashboardSummaryProjection');
const dashboardCache=new TtlCache({maxEntries:250});
const ttl=Number(process.env.DASHBOARD_CACHE_TTL_MS||15000);
const isIsoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||""));
async function getDashboardSummary(actor,query) {
  const from=String(query.from||""),to=String(query.to||""),selectedProcessId=query.process_id==null||query.process_id===""?null:Number(query.process_id);
  if(!isIsoDate(from)||!isIsoDate(to)||from>to)throw publicError("Khoảng thời gian không hợp lệ",400);
  if(selectedProcessId!==null&&(!Number.isSafeInteger(selectedProcessId)||selectedProcessId<=0))throw publicError("Công đoạn không hợp lệ",400);
  if(selectedProcessId!==null&&!await canReadDashboardProcess(db.promise(),actor,selectedProcessId))throw publicError("Công đoạn không tồn tại hoặc nằm ngoài phạm vi được phân công",404);
  const key=`dashboard:${actor.role}:${actor.id}:${selectedProcessId||"all"}:${from}:${to}`;
  const cached=dashboardCache.get(key);
  if(cached)return {payload:cached,cache:"HIT"};
  // Request filters must not mutate the authenticated actor or its cached identity.
  const rows=await readDashboardSummary(db.promise(),{...actor,__dashboardProcessId:selectedProcessId},{from,to,selectedProcessId});
  const payload=projectDashboardSummary({from,to,...rows});
  dashboardCache.set(key,payload,ttl);
  return {payload,cache:"MISS"};
}
module.exports={getDashboardSummary,clearDashboardCache:()=>dashboardCache.clear()};
