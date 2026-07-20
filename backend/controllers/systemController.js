const db = require('../config/db');
const { publicMessage } = require('../utils/httpError');

exports.getNotifications = async (req,res) => {
 try {
  const limit = Math.min(Math.max(Number(req.query.limit)||30,1),100);
  const [rows] = await db.promise().query(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?`, [req.user.id, limit]);
  const [[count]] = await db.promise().query(`SELECT COUNT(*) unread FROM notifications WHERE user_id=? AND is_read=0`, [req.user.id]);
  res.json({success:true,data:rows,unread:Number(count.unread||0)});
 } catch(e){ console.error('GET NOTIFICATIONS ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải thông báo')}); }
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
  const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);
  const params=[]; let where='1=1';
  if(req.user.role==='worker'){ where+=' AND a.user_id=?'; params.push(req.user.id); }
  const [rows]=await db.promise().query(`SELECT a.*,u.full_name,u.username FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE ${where} ORDER BY a.created_at DESC LIMIT ?`,[...params,limit]);
  res.json({success:true,data:rows});
 } catch(e){ console.error('GET ACTIVITIES ERROR:', e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải lịch sử hoạt động')});}
};
exports.getReportVersions = async (req,res) => {
 try {
  const reportId=Number(req.params.id); const type=req.query.type==='temp'?'temp':'approved';
  const table=type==='temp'?'production_reports_temp':'production_reports';
  const [access]=await db.promise().query(
   `SELECT r.id, r.worker_id FROM ${table} r WHERE r.id=? AND (\n      ?='admin' OR\n      (?='worker' AND r.worker_id=?) OR\n      (? IN ('manager','lead') AND EXISTS (SELECT 1 FROM manager_processes mp WHERE mp.manager_id=? AND mp.process_id=r.process_id))\n    ) LIMIT 1`,
   [reportId,req.user.role,req.user.role,req.user.worker_id||0,req.user.role,req.user.id]
  );
  if(!access.length) return res.status(404).json({success:false,message:'Không tìm thấy báo cáo hoặc bạn không có quyền truy cập'});
  const [rows]=await db.promise().query(`SELECT rv.id,rv.version_no,rv.change_reason,rv.created_at,rv.snapshot_json,u.full_name created_by_name FROM report_versions rv LEFT JOIN users u ON u.id=rv.created_by WHERE rv.report_type=? AND rv.report_id=? ORDER BY rv.version_no DESC`,[type,reportId]);
  res.json({success:true,data:rows});
 } catch(e){ console.error('GET REPORT VERSIONS ERROR:',e); res.status(500).json({success:false,message:publicMessage(e,'Không thể tải phiên bản báo cáo')});}
};
