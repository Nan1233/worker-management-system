'use strict';
async function getActorProcessIds(connection, actor) {
  if (actor?.role === 'admin') return null;
  const [rows] = await connection.query('SELECT process_id FROM manager_processes WHERE manager_id=?', [actor?.id]);
  return rows.map((row) => Number(row.process_id));
}

async function validateProcessAssignment(connection, actor, processIds, required = true) {
  if (required && processIds.length === 0) {
    const error = new Error('Phải phân ít nhất một công đoạn');
    error.status = 400;
    throw error;
  }
  if (!processIds.length) return;
  const [valid] = await connection.query(`SELECT id FROM processes WHERE id IN (${processIds.map(() => '?').join(',')}) AND status='active'`, processIds);
  if (valid.length !== processIds.length) {
    const error = new Error('Có công đoạn không tồn tại hoặc đã ngừng sử dụng');
    error.status = 400;
    throw error;
  }
  const actorProcessIds = await getActorProcessIds(connection, actor);
  if (actorProcessIds && processIds.some((id) => !actorProcessIds.includes(id))) {
    const error = new Error('Bạn không được phân công đoạn ngoài phạm vi phụ trách');
    error.status = 403;
    throw error;
  }
}

async function replaceProcessAssignments(connection, role, userId, workerId, processIds) {
  if (role === 'worker') {
    await connection.query('DELETE FROM worker_processes WHERE worker_id=?', [workerId]);
    if (processIds.length) await connection.query('INSERT INTO worker_processes (worker_id,process_id) VALUES ?', [processIds.map((processId) => [workerId, processId])]);
    return;
  }
  await connection.query('DELETE FROM manager_processes WHERE manager_id=?', [userId]);
  if (processIds.length) await connection.query('INSERT INTO manager_processes (manager_id,process_id) VALUES ?', [processIds.map((processId) => [userId, processId])]);
}

module.exports={getActorProcessIds,validateProcessAssignment,replaceProcessAssignments};
