const db = require('../config/db');

exports.summary = async (req, res, next) => {
  try {
    const [[locks], [plans], [issues], [standards], [snapshots]] = await Promise.all([
      db.promise().query(`SELECT COUNT(*) total FROM reporting_period_locks WHERE status='locked'`),
      db.promise().query(`SELECT COUNT(*) total FROM production_plans WHERE plan_date >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`),
      db.promise().query(`SELECT COUNT(*) total FROM report_validation_results WHERE resolved=0`),
      db.promise().query(`SELECT COUNT(*) total FROM product_standard_versions WHERE status='active'`),
      db.promise().query(`SELECT COUNT(*) total FROM production_report_snapshots`)
    ]);
    res.json({ success:true, data:{
      locked_periods:Number(locks[0]?.total||0), monthly_plans:Number(plans[0]?.total||0),
      open_validation_issues:Number(issues[0]?.total||0), active_standard_versions:Number(standards[0]?.total||0),
      approved_snapshots:Number(snapshots[0]?.total||0)
    }});
  } catch (e) { next(e); }
};

exports.listLocks = async (req,res,next) => { try {
  const [rows]=await db.promise().query(`SELECT l.*, p.process_name, u.full_name locked_by_name
    FROM reporting_period_locks l LEFT JOIN processes p ON p.id=l.process_id
    LEFT JOIN users u ON u.id=l.locked_by ORDER BY report_year DESC, report_month DESC, process_id`);
  res.json({success:true,data:rows});
} catch(e){next(e);} };

exports.lockPeriod = async (req,res,next) => { try {
  const year=Number(req.body.year), month=Number(req.body.month), processId=req.body.process_id?Number(req.body.process_id):null;
  if(!Number.isInteger(year)||year<2020||!Number.isInteger(month)||month<1||month>12) return res.status(400).json({success:false,message:'Kỳ báo cáo không hợp lệ'});
  await db.promise().query(`INSERT INTO reporting_period_locks(report_year,report_month,process_id,status,reason,locked_by)
    VALUES(?,?,?,'locked',?,?) ON DUPLICATE KEY UPDATE status='locked',reason=VALUES(reason),locked_by=VALUES(locked_by),locked_at=CURRENT_TIMESTAMP,unlocked_by=NULL,unlocked_at=NULL`,
    [year,month,processId,String(req.body.reason||'').trim()||null,req.user.id]);
  res.json({success:true,message:'Đã khóa kỳ báo cáo'});
} catch(e){next(e);} };

exports.unlockPeriod = async (req,res,next) => { try {
  await db.promise().query(`UPDATE reporting_period_locks SET status='unlocked',unlocked_by=?,unlocked_at=CURRENT_TIMESTAMP WHERE id=?`,[req.user.id,Number(req.params.id)]);
  res.json({success:true,message:'Đã mở khóa kỳ báo cáo'});
} catch(e){next(e);} };

exports.listPlans = async (req,res,next) => { try {
  const from=String(req.query.from||'').slice(0,10), to=String(req.query.to||'').slice(0,10);
  const params=[]; let where='1=1';
  if(from){where+=' AND pp.plan_date>=?';params.push(from)} if(to){where+=' AND pp.plan_date<=?';params.push(to)}
  const [rows]=await db.promise().query(`SELECT pp.*,p.process_name,m.machine_code,u.full_name created_by_name
    FROM production_plans pp JOIN processes p ON p.id=pp.process_id LEFT JOIN machines m ON m.id=pp.machine_id
    LEFT JOIN users u ON u.id=pp.created_by WHERE ${where} ORDER BY pp.plan_date DESC,pp.priority DESC,pp.id DESC LIMIT 1000`,params);
  res.json({success:true,data:rows});
} catch(e){next(e);} };

exports.createPlan = async (req,res,next) => { try {
  const b=req.body||{};
  if(!b.plan_date||!Number(b.process_id)||!String(b.product_code||'').trim()) return res.status(400).json({success:false,message:'Thiếu ngày, công đoạn hoặc mã sản phẩm'});
  const [r]=await db.promise().query(`INSERT INTO production_plans(plan_date,shift,process_id,machine_id,product_code,planned_quantity,planned_minutes,planned_workers,priority,status,note,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[b.plan_date,b.shift||null,Number(b.process_id),b.machine_id?Number(b.machine_id):null,String(b.product_code).trim(),Number(b.planned_quantity||0),Number(b.planned_minutes||0),Number(b.planned_workers||0),Number(b.priority||0),b.status||'draft',String(b.note||'').trim()||null,req.user.id]);
  res.status(201).json({success:true,id:r.insertId,message:'Đã tạo kế hoạch'});
} catch(e){next(e);} };

exports.validationIssues = async (req,res,next) => { try {
  const [rows]=await db.promise().query(`SELECT * FROM report_validation_results WHERE resolved=0 ORDER BY FIELD(severity,'error','warning','info'),created_at DESC LIMIT 1000`);
  res.json({success:true,data:rows});
} catch(e){next(e);} };
