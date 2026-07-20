const db = require('../config/db');

exports.getNotifications = async (req,res) => {
 try {
  const limit = Math.min(Math.max(Number(req.query.limit)||30,1),100);
  const [rows] = await db.promise().query(`SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ?`, [req.user.id, limit]);
  const [[count]] = await db.promise().query(`SELECT COUNT(*) unread FROM notifications WHERE user_id=? AND is_read=0`, [req.user.id]);
  res.json({success:true,data:rows,unread:Number(count.unread||0)});
 } catch(e){ res.status(500).json({success:false,message:e.message}); }
};
exports.markNotificationRead = async (req,res) => {
 try { await db.promise().query(`UPDATE notifications SET is_read=1, read_at=NOW() WHERE id=? AND user_id=?`,[req.params.id,req.user.id]); res.json({success:true}); }
 catch(e){ res.status(500).json({success:false,message:e.message}); }
};
exports.markAllNotificationsRead = async (req,res) => {
 try { await db.promise().query(`UPDATE notifications SET is_read=1, read_at=NOW() WHERE user_id=? AND is_read=0`,[req.user.id]); res.json({success:true}); }
 catch(e){ res.status(500).json({success:false,message:e.message}); }
};
exports.getActivities = async (req,res) => {
 try {
  const limit=Math.min(Math.max(Number(req.query.limit)||50,1),200);
  const params=[]; let where='1=1';
  if(req.user.role==='worker'){ where+=' AND a.user_id=?'; params.push(req.user.id); }
  const [rows]=await db.promise().query(`SELECT a.*,u.full_name,u.username FROM activity_logs a LEFT JOIN users u ON u.id=a.user_id WHERE ${where} ORDER BY a.created_at DESC LIMIT ?`,[...params,limit]);
  res.json({success:true,data:rows});
 } catch(e){res.status(500).json({success:false,message:e.message});}
};
exports.getReportVersions = async (req,res) => {
 try { const [rows]=await db.promise().query(`SELECT rv.id,rv.version_no,rv.change_reason,rv.created_at,rv.snapshot_json,u.full_name created_by_name FROM report_versions rv LEFT JOIN users u ON u.id=rv.created_by WHERE rv.report_type=? AND rv.report_id=? ORDER BY rv.version_no DESC`,[req.query.type||'approved',req.params.id]); res.json({success:true,data:rows}); }
 catch(e){res.status(500).json({success:false,message:e.message});}
};
