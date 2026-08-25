const db = require('../config/db');

const LIMITS = { manager: 1, lead: 3 };

function normalizeProcessIds(value) {
  return [...new Set((Array.isArray(value) ? value : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

async function getCurrentTarget(connection, id) {
  const [rows] = await connection.query(
    'SELECT u.id, u.role, u.status FROM users u WHERE u.id=? LIMIT 1',
    [id]
  );
  return rows[0] || null;
}

async function checkCapacity(connection, role, processIds, excludeUserId = null) {
  const limit = LIMITS[role];
  if (!limit || !processIds.length) return;

  for (const processId of processIds) {
    const params = [role, processId];
    let exclude = '';
    if (excludeUserId) {
      exclude = ' AND u.id<>?';
      params.push(excludeUserId);
    }

    const [rows] = await connection.query(
      `SELECT u.id
         FROM users u
         INNER JOIN manager_processes mp ON mp.manager_id=u.id
        WHERE u.role=? AND u.status='active' AND mp.process_id=?${exclude}
        LIMIT ${limit}`,
      params
    );

    if (rows.length >= limit) {
      const label = role === 'manager' ? 'quản lý' : 'tổ trưởng';
      const limitText = role === 'manager' ? '1' : '3';
      const error = new Error(`Công đoạn đã đủ ${limitText} ${label}`);
      error.status = 409;
      error.code = 'PROCESS_ASSIGNMENT_CAPACITY';
      error.processId = processId;
      error.role = role;
      throw error;
    }
  }
}

module.exports = async function processAssignmentCapacity(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next();

  const roleFromBody = String(req.body?.role || '').trim();
  const processIdsProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'process_ids');
  const connection = await db.promise().getConnection();

  try {
    let role = roleFromBody;
    let target = null;
    let targetId = null;

    if (req.method !== 'POST') {
      targetId = Number(req.params?.id);
      if (!Number.isInteger(targetId) || targetId <= 0) return next();
      target = await getCurrentTarget(connection, targetId);
      if (!target) return next();
      role = target.role;
    }

    if (!LIMITS[role]) return next();

    const nextStatus = Object.prototype.hasOwnProperty.call(req.body || {}, 'status')
      ? (req.body.status === 'inactive' ? 'inactive' : 'active')
      : (target?.status || 'active');

    if (nextStatus !== 'active') return next();

    if (req.method !== 'POST' && !processIdsProvided) {
      const [rows] = await connection.query(
        'SELECT process_id FROM manager_processes WHERE manager_id=? ORDER BY process_id',
        [targetId]
      );
      await checkCapacity(connection, role, rows.map((row) => Number(row.process_id)), targetId);
      return next();
    }

    const processIds = normalizeProcessIds(req.body?.process_ids);
    if (!processIds.length) {
      const error = new Error('Phải phân ít nhất một công đoạn');
      error.status = 400;
      return res.status(400).json({ success: false, message: error.message });
    }

    await checkCapacity(connection, role, processIds, targetId);
    return next();
  } catch (error) {
    if (error?.code === 'PROCESS_ASSIGNMENT_CAPACITY' || error?.status === 409) {
      return res.status(409).json({
        success: false,
        code: error.code || 'PROCESS_ASSIGNMENT_CAPACITY',
        process_id: error.processId,
        role: error.role,
        message: error.message
      });
    }
    console.error('processAssignmentCapacity middleware error', error);
    return res.status(500).json({ success: false, message: 'Không thể kiểm tra giới hạn nhân sự theo công đoạn' });
  } finally {
    connection.release();
  }
};
