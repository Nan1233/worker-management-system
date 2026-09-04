const db = require('../config/db');
const { clearWorkerProfile } = require('../utils/workerProfileCache');
const { deleteCachedAuthUser } = require('../utils/authUserCache');
const { revokeAllUserFamilies } = require('../services/refreshSessionService');

/**
 * Permanently remove a lead account while preserving the worker identity
 * used by historical production reports whenever the workers.user_id FK
 * permits detaching it.
 *
 * This endpoint is intentionally lead-only. Managers/workers keep the
 * existing soft-disable behavior.
 */
exports.deleteLeadPermanently = async (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ success: false, message: 'ID người dùng không hợp lệ' });
  }

  if (!['admin', 'manager'].includes(String(req.user?.role || '').toLowerCase())) {
    return res.status(403).json({ success: false, message: 'Chỉ Admin hoặc Quản lý mới được xóa vĩnh viễn Tổ trưởng' });
  }

  const connection = await db.promise().getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT u.id,u.role,u.full_name,u.username,w.id AS worker_id
       FROM users u
       LEFT JOIN workers w ON w.user_id=u.id
       WHERE u.id=? LIMIT 1`,
      [targetId]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Tài khoản không tồn tại' });
    }

    const target = rows[0];
    if (target.role !== 'lead') {
      await connection.rollback();
      return res.status(400).json({ success: false, message: 'Chức năng này chỉ áp dụng cho tài khoản Tổ trưởng' });
    }

    if (req.user.role === 'manager') {
      const [scope] = await connection.query(
        `SELECT 1
         FROM manager_processes actor_mp
         INNER JOIN manager_processes target_mp ON target_mp.process_id=actor_mp.process_id
         WHERE actor_mp.manager_id=? AND target_mp.manager_id=? LIMIT 1`,
        [req.user.id, targetId]
      );
      if (!scope.length) {
        await connection.rollback();
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xóa Tổ trưởng ngoài phạm vi công đoạn phụ trách' });
      }
    }

    // Remove role assignments first so no manager_processes row points at the account.
    await connection.query('DELETE FROM manager_processes WHERE manager_id=?', [targetId]);

    // Revoke active sessions before deleting the account.
    try { await revokeAllUserFamilies(targetId); } catch (_) {}

    // Historical production reports are linked through workers.id, not users.id.
    // Detach the worker row when possible so those reports remain queryable.
    if (target.worker_id) {
      const [[column]] = await connection.query(
        `SELECT IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='workers' AND COLUMN_NAME='user_id' LIMIT 1`
      );
      if (column?.IS_NULLABLE === 'YES') {
        await connection.query('UPDATE workers SET user_id=NULL, position=CASE WHEN position IS NULL OR position=\'Tổ trưởng\' THEN position ELSE position END WHERE id=?', [target.worker_id]);
      } else {
        // If the schema cannot detach workers.user_id, do not destroy the
        // historical worker/report relationship by deleting the worker row.
        await connection.rollback();
        return res.status(409).json({
          success: false,
          code: 'LEAD_DELETE_REQUIRES_NULLABLE_WORKER_USER',
          message: 'Không thể xóa vĩnh viễn vì workers.user_id đang bắt buộc. Để bảo toàn lịch sử báo cáo, cần cho phép workers.user_id nhận NULL trước.'
        });
      }
    }

    await connection.query('DELETE FROM users WHERE id=? AND role=\'lead\'', [targetId]);
    await connection.commit();

    try { clearWorkerProfile(target.worker_id); } catch (_) {}
    try { deleteCachedAuthUser(targetId); } catch (_) {}

    return res.json({
      success: true,
      message: `Đã xóa vĩnh viễn Tổ trưởng ${target.full_name || target.username || targetId}`,
      data: { user_id: targetId, worker_id: target.worker_id || null }
    });
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    console.error('deleteLeadPermanently error', error);
    return res.status(error?.status || 500).json({
      success: false,
      message: error?.message || 'Không thể xóa vĩnh viễn Tổ trưởng'
    });
  } finally {
    connection.release();
  }
};
