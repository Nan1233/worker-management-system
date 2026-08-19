const db = require('../config/db');
const { ensureSchema } = require('../services/governanceSchemaService');
const { getActorProcessScope, assertProcessScope, scopeSql } = require('../services/processAuthorizationService');

const sendAuth = (res, error) => res.status(error.status || error.statusCode || 403).json({success:false,code:error.code || 'PROCESS_SCOPE_FORBIDDEN',message:error.message});

exports.summary = async (req, res, next) => {
  try {
    await ensureSchema();
    const scope = await getActorProcessScope(req.user);
    const lockScope = scope.type === 'ALL' ? {clause:'',params:[]} : scopeSql(scope,'l.process_id',[]);
    const planScope = scopeSql(scope,'pp.process_id',[]);
    const stdScope = scopeSql(scope,'psv.process_id',[]);
    const snapScope = scopeSql(scope,'pr.process_id',[]);
    const issueScope = scopeSql(scope,'COALESCE(pr.process_id,prt.process_id)',[]);
    const [[locks],[plans],[issues],[standards],[snapshots]] = await Promise.all([
      db.promise().query(`SELECT COUNT(*) total FROM reporting_period_locks l WHERE status='locked' ${scope.type === 'ALL' ? '' : `AND (l.process_id IS NULL ${lockScope.clause.replace(/^ AND /,' OR ')})`}`, lockScope.params),
      db.promise().query(`SELECT COUNT(*) total FROM production_plans pp WHERE plan_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') ${planScope.clause}`, planScope.params),
      db.promise().query(`SELECT COUNT(*) total FROM report_validation_results vr LEFT JOIN production_reports pr ON vr.report_type='approved' AND pr.id=vr.report_id LEFT JOIN production_reports_temp prt ON vr.report_type<>'approved' AND prt.id=vr.report_id WHERE vr.resolved=0 ${issueScope.clause}`, issueScope.params),
      db.promise().query(`SELECT COUNT(*) total FROM product_standard_versions psv WHERE status='active' ${stdScope.clause}`, stdScope.params),
      db.promise().query(`SELECT COUNT(*) total FROM production_report_snapshots s JOIN production_reports pr ON pr.id=s.report_id WHERE 1=1 ${snapScope.clause}`, snapScope.params)
    ]);
    res.json({success:true,data:{locked_periods:Number(locks[0]?.total||0),monthly_plans:Number(plans[0]?.total||0),open_validation_issues:Number(issues[0]?.total||0),active_standard_versions:Number(standards[0]?.total||0),approved_snapshots:Number(snapshots[0]?.total||0)}});
  } catch(e){ if(e?.status===403)return sendAuth(res,e); next(e); }
};

exports.listLocks = async (req,res,next) => { try {
  await ensureSchema(); const scope=await getActorProcessScope(req.user); const scoped=scopeSql(scope,'l.process_id',[]);
  const where=scope.type==='ALL'?'1=1':`(l.process_id IS NULL ${scoped.clause.replace(/^ AND /,' OR ')})`;
  const [rows]=await db.promise().query(`SELECT l.*,p.process_name,u.full_name locked_by_name FROM reporting_period_locks l LEFT JOIN processes p ON p.id=l.process_id LEFT JOIN users u ON u.id=l.locked_by WHERE ${where} ORDER BY report_year DESC,report_month DESC,process_id`,scoped.params);
  res.json({success:true,data:rows});
} catch(e){if(e?.status===403)return sendAuth(res,e);next(e);} };

exports.lockPeriod = async (req,res,next) => { try {
  await ensureSchema(); const year=Number(req.body.year),month=Number(req.body.month),processId=req.body.process_id?Number(req.body.process_id):null;
  if(!Number.isInteger(year)||year<2020||!Number.isInteger(month)||month<1||month>12)return res.status(400).json({success:false,message:'Kỳ báo cáo không hợp lệ'});
  if(processId===null){if(req.user?.role!=='admin')return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được khóa kỳ toàn hệ thống'});} else await assertProcessScope(req.user,processId,{action:'GOVERNANCE_PERIOD_LOCK'});
  await db.promise().query(`INSERT INTO reporting_period_locks(report_year,report_month,process_id,status,reason,locked_by) VALUES(?,?,?,'locked',?,?) ON DUPLICATE KEY UPDATE status='locked',reason=VALUES(reason),locked_by=VALUES(locked_by),locked_at=CURRENT_TIMESTAMP,unlocked_by=NULL,unlocked_at=NULL`,[year,month,processId,String(req.body.reason||'').trim()||null,req.user.id]);
  res.json({success:true,message:'Đã khóa kỳ báo cáo'});
} catch(e){if(e?.status===403)return sendAuth(res,e);next(e);} };

exports.unlockPeriod = async (req,res,next) => { try {
  await ensureSchema(); const id=Number(req.params.id); const [rows]=await db.promise().query('SELECT id,process_id FROM reporting_period_locks WHERE id=? LIMIT 1',[id]);
  if(!rows[0])return res.status(404).json({success:false,message:'Không tìm thấy kỳ khóa'});
  if(rows[0].process_id==null){if(req.user?.role!=='admin')return res.status(403).json({success:false,code:'PROCESS_SCOPE_FORBIDDEN',message:'Chỉ admin được mở khóa kỳ toàn hệ thống'});} else await assertProcessScope(req.user,rows[0].process_id,{action:'GOVERNANCE_PERIOD_UNLOCK'});
  await db.promise().query(`UPDATE reporting_period_locks SET status='unlocked',unlocked_by=?,unlocked_at=CURRENT_TIMESTAMP WHERE id=?`,[req.user.id,id]);
  res.json({success:true,message:'Đã mở khóa kỳ báo cáo'});
} catch(e){if(e?.status===403)return sendAuth(res,e);next(e);} };

exports.listPlans = async (req,res,next) => { try {
  await ensureSchema(); const from=String(req.query.from||'').slice(0,10),to=String(req.query.to||'').slice(0,10); const scope=await getActorProcessScope(req.user); const params=[]; let where='1=1';
  if(from){where+=' AND pp.plan_date>=?';params.push(from)} if(to){where+=' AND pp.plan_date<=?';params.push(to)} const scoped=scopeSql(scope,'pp.process_id',params); where+=scoped.clause;
  const [rows]=await db.promise().query(`SELECT pp.*,p.process_name,m.machine_code,u.full_name created_by_name FROM production_plans pp JOIN processes p ON p.id=pp.process_id LEFT JOIN machines m ON m.id=pp.machine_id LEFT JOIN users u ON u.id=pp.created_by WHERE ${where} ORDER BY pp.plan_date DESC,pp.priority DESC,pp.id DESC LIMIT 1000`,scoped.params);
  res.json({success:true,data:rows});
} catch(e){if(e?.status===403)return sendAuth(res,e);next(e);} };

exports.createPlan = async (req,res,next) => { try {
  await ensureSchema(); const b=req.body||{}; if(!b.plan_date||!Number(b.process_id)||!String(b.product_code||'').trim())return res.status(400).json({success:false,message:'Thiếu ngày, công đoạn hoặc mã sản phẩm'});
  const processId=Number(b.process_id);
  await assertProcessScope(req.user,processId,{action:'GOVERNANCE_PLAN_CREATE'});
  if(b.machine_id){const [machines]=await db.promise().query('SELECT id,process_id FROM machines WHERE id=? LIMIT 1',[Number(b.machine_id)]);if(!machines[0]||Number(machines[0].process_id)!==processId)return res.status(400).json({success:false,message:'Máy không thuộc công đoạn kế hoạch'});}
  const [r]=await db.promise().query(`INSERT INTO production_plans(plan_date,shift,process_id,machine_id,product_code,planned_quantity,planned_minutes,planned_workers,priority,status,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[b.plan_date,b.shift||null,Number(b.process_id),b.machine_id?Number(b.machine_id):null,String(b.product_code).trim(),Number(b.planned_quantity||0),Number(b.planned_minutes||0),Number(b.planned_workers||0),Number(b.priority||0),b.status||'draft',String(b.note||'').trim()||null,req.user.id]);
  res.status(201).json({success:true,id:r.insertId,message:'Đã tạo kế hoạch'});
} catch(e){if(e?.status===403)return sendAuth(res,e);next(e);} };

exports.validationIssues = async (req,res,next) => { try {
  await ensureSchema(); const scope=await getActorProcessScope(req.user); const scoped=scopeSql(scope,'COALESCE(pr.process_id,prt.process_id)',[]);
  const [rows]=await db.promise().query(`SELECT vr.* FROM report_validation_results vr LEFT JOIN production_reports pr ON vr.report_type='approved' AND pr.id=vr.report_id LEFT JOIN production_reports_temp prt ON vr.report_type<>'approved' AND prt.id=vr.report_id WHERE vr.resolved=0 ${scoped.clause} ORDER BY FIELD(vr.severity,'error','warning','info'),vr.created_at DESC LIMIT 1000`,scoped.params);
  res.json({success:true,data:rows});
} catch(e){if(e?.status===403)return sendAuth(res,e);next(e);} };
