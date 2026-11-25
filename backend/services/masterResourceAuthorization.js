'use strict';
const { getActorProcessScope, assertProcessScope } = require('./processAuthorizationService');

async function assertMasterResourceScope(actor, cfg, id, executor) {
  if (cfg.table === 'processes') {
    await assertProcessScope(actor, id, { executor, action:'MASTER_RESOURCE' });
    return Number(id);
  }
  const [rows] = await executor.query(`SELECT id, process_id FROM ${cfg.table} WHERE id=? LIMIT 1`, [Number(id)]);
  if (!rows.length) return null;
  await assertProcessScope(actor, rows[0].process_id, { executor, action:'MASTER_RESOURCE' });
  return Number(rows[0].process_id);
}

async function assertCanManageWorker(actor, workerId, executor, { requireAllAssignments = false } = {}) {
  if (actor?.role === 'admin') return true;
  const [assigned] = await executor.query('SELECT process_id FROM worker_processes WHERE worker_id=? ORDER BY process_id', [Number(workerId)]);
  const targetIds = assigned.map((row) => Number(row.process_id)).filter(Boolean);
  if (!targetIds.length) throw Object.assign(new Error('Công nhân chưa có công đoạn thuộc phạm vi phụ trách'), { status:403, code:'PROCESS_SCOPE_FORBIDDEN' });
  const scope = await getActorProcessScope(actor, executor);
  if (scope.type === 'ALL') return true;
  const allowed = targetIds.filter((id) => scope.processIds.has(id));
  if (!allowed.length || (requireAllAssignments && allowed.length !== targetIds.length)) {
    throw Object.assign(new Error('Công nhân có phân công ngoài phạm vi phụ trách'), { status:403, code:'PROCESS_SCOPE_FORBIDDEN' });
  }
  return true;
}

module.exports = { assertMasterResourceScope, assertCanManageWorker };
