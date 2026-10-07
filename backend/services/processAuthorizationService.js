function ownershipError(message = 'Bạn không có quyền truy cập dữ liệu của công nhân khác') {
  const error = new Error(message);
  error.status = 403;
  error.statusCode = 403;
  error.code = 'WORKER_OWNERSHIP_FORBIDDEN';
  error.isPublic = true;
  return error;
}

function assertWorkerOwnership(actor, workerId, options = {}) {
  const role = normalizeRole(actor);
  if (role !== 'worker') return true;
  const actorWorkerId = normalizeProcessId(actor?.worker_id);
  const targetWorkerId = normalizeProcessId(workerId);
  if (!actorWorkerId || !targetWorkerId || actorWorkerId !== targetWorkerId) {
    throw ownershipError(options.message);
  }
  return true;
}

function scopeError(message = 'Công đoạn ngoài phạm vi phụ trách', details = null) {
  const error = new Error(message);
  error.status = 403;
  error.statusCode = 403;
  error.code = 'PROCESS_SCOPE_FORBIDDEN';
  error.isPublic = true;
  if (details) error.details = details;
  return error;
}

function normalizeRole(actor) {
  return String(actor?.role || '').trim().toLowerCase();
}

function actorId(actor) {
  const id = Number(actor?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeProcessId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function rows(executor, sql, params = []) {
  if (!executor) executor = require('../config/db');
  if (executor?.promise) {
    const [result] = await executor.promise().query(sql, params);
    return result;
  }
  const ctor = String(executor?.constructor?.name || '');
  if (ctor.includes('Promise')) {
    const [result] = await executor.query(sql, params);
    return result;
  }
  if (typeof executor.query === 'function') {
    const result = await executor.query(sql, params);
    if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
    return result;
  }
  throw new Error('Invalid authorization query executor');
}

async function getActorProcessScope(actor, executor = null) {
  const role = normalizeRole(actor);
  if (role === 'admin') return { type: 'ALL', processIds: null };
  if (!['manager', 'lead'].includes(role)) {
    throw scopeError('Tài khoản không có phạm vi quản lý công đoạn');
  }
  const id = actorId(actor);
  if (!id) throw scopeError('Không xác định được tài khoản quản lý');
  const assigned = await rows(
    executor,
    'SELECT process_id FROM manager_processes WHERE manager_id=? ORDER BY process_id',
    [id]
  );
  const processIds = new Set(
    assigned.map((row) => normalizeProcessId(row.process_id)).filter(Boolean)
  );
  return { type: 'LIMITED', processIds };
}

async function assertActorProcessAccess(actor, processId, options = {}) {
  const id = normalizeProcessId(processId);
  if (!id) throw scopeError('Không xác định được công đoạn của tài nguyên');
  const role = normalizeRole(actor);
  if (role === 'admin') return true;
  const actorIdValue = role === 'worker' ? normalizeProcessId(actor?.worker_id) : actorId(actor);
  if (!actorIdValue) throw scopeError('Không xác định được tài khoản');
  if (!['worker','manager','lead'].includes(role)) {
    throw scopeError('Tài khoản không có quyền truy cập công đoạn');
  }
  const table = role === 'worker' ? 'worker_processes' : 'manager_processes';
  const field = role === 'worker' ? 'worker_id' : 'manager_id';
  const result = await rows(
    options.executor || null,
    `SELECT 1 FROM ${table} WHERE ${field}=? AND process_id=? LIMIT 1`,
    [actorIdValue, id]
  );
  if (result.length) return true;
  throw scopeError(options.message || 'Công đoạn ngoài phạm vi phụ trách', { process_id:id, action:options.action || null });
}

async function isProcessAllowed(actor, processId, executor = null) {
  const id = normalizeProcessId(processId);
  if (!id) return false;
  const scope = await getActorProcessScope(actor, executor);
  return scope.type === 'ALL' || scope.processIds.has(id);
}

async function assertProcessScope(actor, processId, options = {}) {
  const id = normalizeProcessId(processId);
  if (!id) throw scopeError('Không xác định được công đoạn của tài nguyên');
  const scope = await getActorProcessScope(actor, options.executor || null);
  if (scope.type === 'ALL' || scope.processIds.has(id)) return true;
  throw scopeError(options.message || 'Công đoạn ngoài phạm vi phụ trách', {
    process_id: id,
    action: options.action || null
  });
}

async function assertUserManagementScope(actor, target, options = {}) {
  const role = normalizeRole(actor);
  if (!['admin','manager','lead'].includes(role)) throw scopeError('Tài khoản không có quyền quản lý người dùng');
  const targetRole = normalizeRole(target);
  const allowed = role === 'admin'
    ? ['manager','lead','worker']
    : role === 'manager'
      ? ['lead','worker']
      : ['worker'];
  if (!allowed.includes(targetRole)) throw scopeError('Vai trò tài khoản nằm ngoài phạm vi quản lý');
  if (role === 'admin') return true;

  const targetId = targetRole === 'worker'
    ? normalizeProcessId(target?.worker_id)
    : normalizeProcessId(target?.id);
  if (!targetId) throw scopeError('Không xác định được tài khoản cần quản lý');

  const targetTable = targetRole === 'worker' ? 'worker_processes' : 'manager_processes';
  const targetField = targetRole === 'worker' ? 'worker_id' : 'manager_id';
  const actorIdValue = actorId(actor);
  if (!actorIdValue) throw scopeError('Không xác định được tài khoản quản lý');

  const executor = options.executor || null;
  const result = await rows(
    executor,
    `SELECT 1 FROM ${targetTable} target_scope
     WHERE target_scope.${targetField}=?
       AND EXISTS (
         SELECT 1 FROM manager_processes actor_scope
         WHERE actor_scope.manager_id=? AND actor_scope.process_id=target_scope.process_id
       )
     LIMIT 1`,
    [targetId, actorIdValue]
  );
  if (!result.length) throw scopeError(options.message || 'Tài khoản nằm ngoài phạm vi công đoạn phụ trách', {
    target_user_id: Number(target?.id) || null,
    target_role: targetRole,
    action: options.action || null
  });
  return true;
}

async function assertProcessesScope(actor, processIds, options = {}) {
  if (!Array.isArray(processIds)) {
    throw scopeError(options.message || 'Danh sách công đoạn không hợp lệ', {
      invalid_process_ids: [processIds],
      action: options.action || null
    });
  }

  const invalidProcessIds = processIds.filter((value) => normalizeProcessId(value) === null);
  if (invalidProcessIds.length) {
    throw scopeError(options.message || 'Danh sách công đoạn không hợp lệ', {
      invalid_process_ids: invalidProcessIds,
      action: options.action || null
    });
  }

  const requested = [...new Set(processIds.map(normalizeProcessId))];
  if (!requested.length && options.allowEmpty !== true) {
    throw scopeError(options.message || 'Phải chỉ định ít nhất một công đoạn', {
      invalid_process_ids: [],
      action: options.action || null
    });
  }

  const scope = await getActorProcessScope(actor, options.executor || null);
  if (scope.type === 'ALL') return true;

  const forbidden = requested.filter((id) => !scope.processIds.has(id));
  if (!forbidden.length) return true;
  throw scopeError(options.message || 'Một hoặc nhiều công đoạn nằm ngoài phạm vi phụ trách', {
    forbidden_process_ids: forbidden,
    action: options.action || null
  });
}

function scopeSql(scope, column, params = []) {
  if (!scope || scope.type === 'ALL') return { clause: '', params: [...params] };
  const ids = [...scope.processIds];
  if (!ids.length) return { clause: ' AND 1=0', params: [...params] };
  return {
    clause: ` AND ${column} IN (${ids.map(() => '?').join(',')})`,
    params: [...params, ...ids]
  };
}

module.exports = {
  getActorProcessScope,
  assertProcessScope,
  assertActorProcessAccess,
  assertProcessesScope,
  assertUserManagementScope,
  isProcessAllowed,
  scopeSql,
  scopeError,
  assertWorkerOwnership,
  ownershipError
};
