const bcrypt = require('bcrypt');
const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');

const DEFAULT_LEAD_PASSWORD = process.env.KTC_DEFAULT_LEAD_PASSWORD || '123456';
const MAX_LEADS_PER_PROCESS = 3;

exports.promoteWorkerToLead = async (req, res) => {
  const connection = await db.promise().getConnection();
  try {
    const targetId = Number(req.params.id);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ success:false, message:'ID người dùng không hợp lệ' });

    const [targets] = await connection.query(
      `SELECT u.id,u.role,u.status,u.full_name,u.username,w.id AS worker_id,w.worker_code
       FROM users u LEFT JOIN workers w ON w.user_id=u.id WHERE u.id=? LIMIT 1`, [targetId]
    );
    if (!targets.length) return res.status(404).json({ success:false, message:'Người dùng không tồn tại' });
    const target = targets[0];
    if (target.role !== 'worker' || !target.worker_id) return res.status(409).json({ success:false, message:'Chỉ có thể nâng tài khoản công nhân lên tổ trưởng' });

    if (req.user?.role !== 'admin') {
      const [allowed] = await connection.query(
        `SELECT 1 FROM manager_processes actor_mp
         WHERE actor_mp.manager_id=? AND actor_mp.process_id IN
         (SELECT wp.process_id FROM worker_processes wp WHERE wp.worker_id=?) LIMIT 1`,
        [req.user.id, target.worker_id]
      );
      if (!allowed.length) return res.status(403).json({ success:false, message:'Bạn không có quyền nâng công nhân này lên tổ trưởng' });
    }

    const [assignments] = await connection.query(
      `SELECT wp.process_id,p.process_name FROM worker_processes wp
       JOIN processes p ON p.id=wp.process_id WHERE wp.worker_id=? ORDER BY wp.process_id`, [target.worker_id]
    );
    if (!assignments.length) return res.status(400).json({ success:false, message:'Công nhân chưa được phân công công đoạn nên chưa thể nâng lên tổ trưởng' });

    await connection.beginTransaction();
    for (const assignment of assignments) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS total FROM manager_processes mp
         JOIN users u ON u.id=mp.manager_id
         WHERE mp.process_id=? AND u.role='lead' AND u.status='active' AND mp.manager_id<>?`,
        [assignment.process_id, targetId]
      );
      if (Number(rows[0]?.total || 0) >= MAX_LEADS_PER_PROCESS) {
        await connection.rollback();
        return res.status(409).json({ success:false, message:`Công đoạn ${assignment.process_name} đã đủ ${MAX_LEADS_PER_PROCESS} tổ trưởng đang hoạt động` });
      }
    }

    const passwordHash = await bcrypt.hash(DEFAULT_LEAD_PASSWORD, 10);
    await connection.query('UPDATE users SET role=\'lead\', password=?, status=\'active\' WHERE id=?', [passwordHash, targetId]);
    await connection.query('DELETE FROM worker_processes WHERE worker_id=?', [target.worker_id]);
    for (const assignment of assignments) {
      await connection.query(
        `INSERT INTO manager_processes (manager_id,process_id) VALUES (?,?)
         ON DUPLICATE KEY UPDATE manager_id=VALUES(manager_id), process_id=VALUES(process_id)`,
        [targetId, assignment.process_id]
      );
    }

    await revokeAllUserFamilies(targetId, { executor: connection });
    await connection.commit();
    clearWorkerProfile(targetId);
    deleteCachedAuthUser(targetId);
    return res.json({ success:true, message:`Đã nâng ${target.full_name || target.username} lên tổ trưởng`, data:{ user_id:targetId, role:'lead', username:target.username, process_ids:assignments.map(x=>Number(x.process_id)) } });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    if (error?.code === 'ER_DUP_ENTRY') return res.status(409).json({ success:false, message:'Tài khoản đã được phân công công đoạn này' });
    console.error('promoteWorkerToLead error', error);
    return res.status(500).json({ success:false, message:'Không thể nâng công nhân lên tổ trưởng' });
  } finally { connection.release(); }
};
