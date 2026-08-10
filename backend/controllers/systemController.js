const db = require('../config/db');
const { publicMessage } = require('../utils/httpError');
const AuditService = require('../services/auditService');
const { loadApprovedSnapshot } = require('../services/approvedReportEditService');
const runtimeMetrics = require('../services/runtimeMetrics');

const workerNotificationBackfills = new Map();

async function executeWorkerNotificationBackfill(user) {
 const userId = Number(user?.id || 0);
 const workerId = Number(user?.worker_id || 0);
 if (!userId || !workerId || user?.role !== 'worker') return;

 // Bù lịch sử duyệt còn thiếu. NOT EXISTS giúp gọi nhiều lần không bị trùng.
 await db.promise().query(
  `INSERT INTO notifications
   (user_id, type, title, message, link_url, entity_type, entity_id, is_read, created_at)
   SELECT
    ?, 'report_approved', 'Báo cáo đã được duyệt',
    CONCAT(
      'Báo cáo ngày ', DATE_FORMAT(pr.work_date, '%d/%m/%Y'),
      ', ca ', COALESCE(pr.shift, '-'),
      ', sản phẩm ', COALESCE(pr.product_name, '-'),
      ' đã được duyệt.'
    ),
    CONCAT('/worker/history/', pr.id, '?source=approved'),
    'approved_report', pr.id, 0,
    COALESCE(pr.approved_at, pr.updated_at, pr.created_at, NOW())
   FROM production_reports pr
   WHERE pr.worker_id = ?
     AND pr.status = 'approved'
     AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = ?
        AND n.type = 'report_approved'
        AND n.entity_type = 'approved_report'
        AND n.entity_id = pr.id
     )`,
  [userId, workerId, userId]
 );

 // Bù lịch sử từ chối còn thiếu.
 await db.promise().query(
  `INSERT INTO notifications
   (user_id, type, title, message, link_url, entity_type, entity_id, is_read, created_at)
   SELECT
    ?, 'report_rejected', 'Báo cáo đã bị từ chối',
    CONCAT(
      'Báo cáo ngày ', DATE_FORMAT(prt.work_date, '%d/%m/%Y'),
      ', ca ', COALESCE(prt.shift, '-'),
      ' bị từ chối',
      CASE
       WHEN NULLIF(TRIM(prt.review_note), '') IS NULL THEN '.'
       ELSE CONCAT(': ', prt.review_note)
      END
    ),
    CONCAT('/worker/history/', prt.id, '?source=pending'),
    'temp_report', prt.id, 0,
    COALESCE(prt.updated_at, prt.created_at, NOW())
   FROM production_reports_temp prt
   WHERE prt.worker_id = ?
     AND prt.status = 'rejected'
     AND NOT EXISTS (
      SELECT 1
      FROM notifications n
      WHERE n.user_id = ?
        AND n.type = 'report_rejected'
        AND n.entity_type = 'temp_report'
        AND n.entity_id = prt.id
     )`,
  [userId, workerId, userId]
 );
}

async function backfillWorkerReportNotifications(user) {
 const userId = Number(user?.id || 0);
 if (!userId || user?.role !== 'worker') return;

 const current = workerNotificationBackfills.get(userId);
 if (current) {
  await current;
  return;
 }

 const task = executeWorkerNotificationBackfill(user)
  .catch((error) => {
   console.error('BACKFILL WORKER NOTIFICATIONS ERROR:', {
    userId,
    workerId: user?.worker_id,
    message: error?.message
   });
   throw error;
  })
  .finally(() => {
   workerNotificationBackfills.delete(userId);
  });

 workerNotificationBackfills.set(userId, task);
 await task;
}


exports.getObservability = async (_req, res) => {
 try {
  const metrics = runtimeMetrics.snapshot();
  const dbStarted = Date.now();
  await db.promise().query({sql:'SELECT 1 AS ok',timeout:3000});
  res.json({success:true,data:{...metrics,database:{status:'ok',latencyMs:Date.now()-dbStarted}}});
 } catch(e){
  const metrics = runtimeMetrics.snapshot();
  res.status(503).json({success:false,data:{...metrics,database:{status:'unavailable'}},message:'Database unavailable'});
 }
};
exports.getNotifications = async (req,res) => {
 try {
  // Công nhân có thể đã có báo cáo được xử lý trước khi tính năng thông báo
  // được triển khai. Bù các thông báo còn thiếu trước khi trả lịch sử.
  await backfillWorkerReportNotifications(req.user);

  const limit = Math.min(Math.max(Number(req.query.limit)||30,1),100);
  const [rows] = await db.promise().query(
   `SELECT id,user_id,type,title,message,link_url,entity_type,entity_id,is_read,read_at,created_at
    FROM notifications
    WHERE user_id=?
    ORDER BY created_at DESC, id DESC
    LIMIT ?`,
   [Number(req.user.id), limit]
  );
  const [[count]] = await db.promise().query(
   `SELECT COUNT(*) unread FROM notifications WHERE user_id=? AND is_read=0`,
   [Number(req.user.id)]
  );
  res.json({success:true,data:rows,unread:Number(count.unread||0)});
 } catch(e){ console.error('GET NOTIFICATIONS ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải thông báo')}); }
};

exports.getUnreadNotificationCount = async (req,res) => {
 try {
  // Badge chỉ đếm dữ liệu đã có. Không quét/bù lịch sử ở mỗi chu kỳ polling.
  const [[count]] = await db.promise().query(
   `SELECT COUNT(*) unread FROM notifications WHERE user_id=? AND is_read=0`,
   [Number(req.user.id)]
  );
  res.json({success:true,data:{unreadCount:Number(count?.unread||0)}});
 } catch(e){ console.error('GET UNREAD NOTIFICATION COUNT ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải số thông báo chưa đọc')}); }
};

exports.markNotificationRead = async (req,res) => {
 try { await db.promise().query(`UPDATE notifications SET is_read=1, read_at=NOW() WHERE id=? AND user_id=?`,[req.params.id,req.user.id]); res.json({success:true}); }
 catch(e){ console.error('MARK NOTIFICATION ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể cập nhật thông báo')}); }
};
exports.markAllNotificationsRead = async (req,res) => {
 try { await db.promise().query(`UPDATE notifications SET is_read=1, read_at=NOW() WHERE user_id=? AND is_read=0`,[req.user.id]); res.json({success:true}); }
 catch(e){ console.error('MARK ALL NOTIFICATIONS ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể cập nhật thông báo')}); }
};
exports.getActivities = async (req,res) => {
 try {
  await AuditService.ensureSchema();
  const limit=Math.min(Math.max(Number(req.query.limit)||80,1),300);
  const params=[]; let where='1=1';
  if(req.user.role==='worker'){
   where+=' AND a.user_id=?'; params.push(req.user.id);
  } else if(req.user.role==='manager' || req.user.role==='lead'){
   where+=` AND (a.user_id=? OR (
     a.entity_type IN ('approved_report','production_report') AND EXISTS (
       SELECT 1 FROM production_reports pr JOIN manager_processes mp ON mp.process_id=pr.process_id
       WHERE pr.id=a.entity_id AND mp.manager_id=?
     )
   ) OR (
     a.entity_type IN ('temp_report','production_temp') AND EXISTS (
       SELECT 1 FROM production_reports_temp prt JOIN manager_processes mp2 ON mp2.process_id=prt.process_id
       WHERE prt.id=a.entity_id AND mp2.manager_id=?
     )
   ))`;
   params.push(req.user.id,req.user.id,req.user.id);
  }

  const action=String(req.query.action||'').trim().slice(0,80);
  const entityType=String(req.query.entity_type||'').trim().slice(0,80);
  const from=String(req.query.from||'').slice(0,10);
  const to=String(req.query.to||'').slice(0,10);
  const search=String(req.query.search||'').trim().slice(0,120);
  if(action){where+=' AND a.action=?';params.push(action);}
  if(entityType){where+=' AND a.entity_type=?';params.push(entityType);}
  if(/^\d{4}-\d{2}-\d{2}$/.test(from)){where+=' AND a.created_at>=?';params.push(`${from} 00:00:00`);}
  if(/^\d{4}-\d{2}-\d{2}$/.test(to)){where+=' AND a.created_at<?';params.push(`${to} 23:59:59.999999`);}
  if(search){
   where+=` AND (a.description LIKE ? OR a.action LIKE ? OR a.entity_type LIKE ? OR a.entity_id LIKE ? OR u.full_name LIKE ? OR u.username LIKE ?)`;
   const like=`%${search}%`;params.push(like,like,like,like,like,like);
  }

  const [rows]=await db.promise().query(
   `SELECT a.*,u.full_name,u.username,u.role
    FROM activity_logs a
    LEFT JOIN users u ON u.id=a.user_id
    WHERE ${where}
    ORDER BY a.created_at DESC,a.id DESC
    LIMIT ?`,
   [...params,limit]
  );
  res.json({success:true,data:rows});
 } catch(e){ console.error('GET ACTIVITIES ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải lịch sử hoạt động')});}
};
exports.getReportVersions = async (req,res) => {
 try {
  await AuditService.ensureSchema();
  const reportId=Number(req.params.id); const type=req.query.type==='temp'?'temp':'approved';
  const table=type==='temp'?'production_reports_temp':'production_reports';
  const [access]=await db.promise().query(
   `SELECT r.id, r.worker_id FROM ${table} r WHERE r.id=? AND (\n      ?='admin' OR\n      (?='worker' AND r.worker_id=?) OR\n      (? IN ('manager','lead') AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=r.process_id))\n    ) LIMIT 1`,
   [reportId,req.user.role,req.user.role,req.user.worker_id||0,req.user.role,req.user.id]
  );
  if(!access.length) return res.status(404).json({success:false,message:'Không tìm thấy báo cáo hoặc bạn không có quyền truy cập'});
  let [rows]=await db.promise().query(`SELECT rv.id,rv.version_no,rv.change_reason,rv.created_at,rv.snapshot_json,u.full_name created_by_name FROM report_versions rv LEFT JOIN users u ON u.id=rv.created_by WHERE rv.report_type=? AND rv.report_id=? ORDER BY rv.version_no DESC`,[type,reportId]);
  // Báo cáo đã tồn tại trước khi bật versioning vẫn phải demo/xem lịch sử được.
  // Lần mở đầu tiên tạo một baseline trung tính, không gán cho người đang xem.
  if(type==='approved' && rows.length===0){
   const snapshot=await loadApprovedSnapshot(reportId);
   if(snapshot){
    await AuditService.createReportVersion({
     reportType:'approved',reportId,snapshot,
     reason:'Phiên bản cơ sở khi bật lịch sử báo cáo',userId:null
    });
    [rows]=await db.promise().query(`SELECT rv.id,rv.version_no,rv.change_reason,rv.created_at,rv.snapshot_json,u.full_name created_by_name FROM report_versions rv LEFT JOIN users u ON u.id=rv.created_by WHERE rv.report_type=? AND rv.report_id=? ORDER BY rv.version_no DESC`,[type,reportId]);
   }
  }
  res.json({success:true,data:rows});
 } catch(e){ console.error('GET REPORT VERSIONS ERROR:',e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải phiên bản báo cáo')});}
};

exports.getDeletedReports = async (req,res) => {
 try {
  const params=[];
  let scope='1=1';
  if(req.user.role==='manager' || req.user.role==='lead'){
   scope=`EXISTS (
     SELECT 1 FROM manager_processes mp
     WHERE mp.manager_id=? AND mp.process_id=pr.process_id
   )`;
   params.push(req.user.id);
  }
  const [rows]=await db.promise().query(
   `SELECT pr.id,pr.work_date,pr.shift,pr.machine_no,pr.product_name,pr.review_note,pr.updated_at,
           w.worker_code,u.full_name,p.process_code,p.process_name
    FROM production_reports pr
    JOIN workers w ON w.id=pr.worker_id
    JOIN users u ON u.id=w.user_id
    LEFT JOIN processes p ON p.id=pr.process_id
    WHERE pr.status='deleted' AND ${scope}
    ORDER BY pr.updated_at DESC,pr.id DESC
    LIMIT 300`,
   params
  );
  res.json({success:true,data:rows});
 } catch(e){
  console.error('GET DELETED REPORTS ERROR:',e);
  res.status(500).json({success:false,message:publicMessage(e,'Không thể tải dữ liệu đã xóa')});
 }
};
