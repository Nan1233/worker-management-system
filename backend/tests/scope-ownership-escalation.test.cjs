const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertProcessScope,
  assertProcessesScope,
  assertWorkerOwnership,
  assertUserManagementScope
} = require('../services/processAuthorizationService');

function fakeAssignments(initial = {}) {
  const state = new Map(Object.entries(initial).map(([id, values]) => [Number(id), values.map(Number)]));
  return {
    state,
    async query(sql, params) {
      if (/manager_processes/i.test(sql)) {
        const id = Number(params[0]);
        if (/actor_scope/i.test(sql)) {
          const targetId = Number(params[0]);
          const actorId = Number(params[1]);
          const targetTable = /worker_processes/i.test(sql) ? 'worker_processes' : 'manager_processes';
          for (const [scopeId, processIds] of state.entries()) {
            if (scopeId !== targetId && scopeId === actorId && processIds.some((p) => (state.get(targetId) || []).includes(p))) {
              return [[{ ok: 1 }], []];
            }
          }
          return [[], []];
        }
        return [(state.get(id) || []).map((process_id) => ({ process_id })), []];
      }
      if (/worker_processes/i.test(sql)) {
        const targetId = Number(params[0]);
        const actorId = Number(params[1]);
        const target = state.get(targetId) || [];
        const actor = state.get(actorId) || [];
        return [target.some((p) => actor.includes(p)) ? [{ ok: 1 }] : [], []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
}

async function forbidden(promise, code = 'PROCESS_SCOPE_FORBIDDEN') {
  await assert.rejects(
    promise,
    (error) => error?.status === 403 && error?.statusCode === 403 && error?.code === code
  );
}

test('process scope allows assigned process and blocks an unassigned process', async () => {
  const db = fakeAssignments({ 101: [10, 20] });

  await assert.doesNotReject(
    assertProcessScope({ id: 101, role: 'manager' }, 10, { executor: db, action: 'TEST_SCOPE_ALLOW' })
  );
  await forbidden(
    assertProcessScope({ id: 101, role: 'manager' }, 30, { executor: db, action: 'TEST_SCOPE_DENY' })
  );
});

test('multi-process scope rejects mixed authorized + unauthorized requests atomically', async () => {
  const db = fakeAssignments({ 102: [10, 20] });

  await assert.doesNotReject(
    assertProcessesScope({ id: 102, role: 'lead' }, [20, 10], { executor: db })
  );
  await forbidden(
    assertProcessesScope({ id: 102, role: 'lead' }, [10, 99], { executor: db })
  );
});

test('empty process scope is deny-by-default', async () => {
  const db = fakeAssignments({ 103: [] });
  await forbidden(
    assertProcessScope({ id: 103, role: 'manager' }, 10, { executor: db })
  );
  await forbidden(
    assertProcessesScope({ id: 103, role: 'manager' }, [10], { executor: db })
  );
});

test('admin bypasses process scope but worker cannot use management scope', async () => {
  const db = fakeAssignments({ 104: [] });

  await assert.doesNotReject(
    assertProcessScope({ id: 104, role: 'admin' }, 999, { executor: db })
  );
  await forbidden(
    assertProcessScope({ id: 104, role: 'worker', worker_id: 104 }, 999, { executor: db })
  );
});

test('worker ownership allows own worker_id and blocks another worker_id', () => {
  assert.equal(assertWorkerOwnership({ id: 201, role: 'worker', worker_id: 501 }, 501), true);
  assert.throws(
    () => assertWorkerOwnership({ id: 201, role: 'worker', worker_id: 501 }, 502),
    (error) => error?.status === 403 && error?.code === 'WORKER_OWNERSHIP_FORBIDDEN'
  );
  assert.throws(
    () => assertWorkerOwnership({ id: 201, role: 'worker', worker_id: 501 }, null),
    (error) => error?.status === 403 && error?.code === 'WORKER_OWNERSHIP_FORBIDDEN'
  );
});

test('non-worker roles cannot be used to bypass worker ownership boundary', () => {
  assert.equal(assertWorkerOwnership({ id: 202, role: 'lead', worker_id: 501 }, 999), true);
  assert.equal(assertWorkerOwnership({ id: 203, role: 'manager', worker_id: 501 }, 999), true);
  assert.equal(assertWorkerOwnership({ id: 204, role: 'admin', worker_id: 501 }, 999), true);
});

test('manager/lead user-management scope blocks cross-process targets', async () => {
  const db = fakeAssignments({ 301: [10], 401: [10], 402: [20] });

  await assert.doesNotReject(
    assertUserManagementScope(
      { id: 301, role: 'manager' },
      { id: 401, role: 'worker', worker_id: 401 },
      { executor: db, action: 'TEST_USER_SCOPE_ALLOW' }
    )
  );
  await forbidden(
    assertUserManagementScope(
      { id: 301, role: 'manager' },
      { id: 402, role: 'worker', worker_id: 402 },
      { executor: db, action: 'TEST_USER_SCOPE_DENY' }
    )
  );
});

test('privilege escalation: manager cannot manage manager; lead cannot manage lead', async () => {
  const db = fakeAssignments({ 302: [10], 403: [10] });

  await forbidden(
    assertUserManagementScope(
      { id: 302, role: 'manager' },
      { id: 403, role: 'manager' },
      { executor: db }
    )
  );
  await forbidden(
    assertUserManagementScope(
      { id: 304, role: 'lead' },
      { id: 405, role: 'lead' },
      { executor: db }
    )
  );
});

test('privilege escalation: management scope is not inferred from forged process_ids on actor', async () => {
  const db = fakeAssignments({ 305: [10] });
  const forgedActor = { id: 305, role: 'manager', process_ids: [999, 1000] };

  await forbidden(
    assertProcessScope(forgedActor, 999, { executor: db, action: 'TEST_FORGED_SCOPE' })
  );
  await assert.doesNotReject(
    assertProcessScope(forgedActor, 10, { executor: db, action: 'TEST_REAL_SCOPE' })
  );
});

test('privilege escalation: invalid actor ids and invalid process ids fail closed', async () => {
  const db = fakeAssignments({ 306: [10] });

  await forbidden(assertProcessScope({ id: 0, role: 'manager' }, 10, { executor: db }));
  await forbidden(assertProcessScope({ id: 306, role: 'manager' }, 0, { executor: db }));
  await forbidden(assertProcessScope({ id: 306, role: 'manager' }, 'abc', { executor: db }));
});

test('security boundary source contains centralized scope + ownership checks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const auth = fs.readFileSync(path.join(__dirname, '../services/processAuthorizationService.js'), 'utf8');
  assert.match(auth, /function assertProcessScope/);
  assert.match(auth, /function assertProcessesScope/);
  assert.match(auth, /function assertWorkerOwnership/);
  assert.match(auth, /WORKER_OWNERSHIP_FORBIDDEN/);
  assert.match(auth, /PROCESS_SCOPE_FORBIDDEN/);
});
