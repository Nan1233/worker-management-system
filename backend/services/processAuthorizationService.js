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

async function assertProcessesScope(actor, processIds, options = {}) {
  const requested = [...new Set((Array.isArray(processIds) ? processIds : []).map(normalizeProcessId).filter(Boolean))];
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
  assertProcessesScope,
  isProcessAllowed,
  scopeSql,
  scopeError
};
