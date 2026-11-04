process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-duplicate-confirmation-secret';
const test = require('node:test');
const assert = require('node:assert/strict');
const { issueDuplicateConfirmation } = require('../services/duplicateConfirmationService');

function loadCreateModelHarness() {
  const dbPath = require.resolve('../config/db');
  const sharedPath = require.resolve('../models/productionTempModelShared');
  const trainingPath = require.resolve('../services/trainingSnapshotService');
  const capacityPath = require.resolve('../services/factoryMachineRuleService');
  const auditPath = require.resolve('../services/auditService');
  const modelPath = require.resolve('../models/productionTempCreateModel');

  const rows = [];
  const requestRows = new Map();
  const committed = [];
  const rolledBack = [];
  const lockQueues = new Map();
  let nextId = 1;

  function cacheModule(filename, exports) {
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
  }

  const fakeDb = {};
  cacheModule(dbPath, fakeDb);
  cacheModule(sharedPath, {
    query: async (_executor, sql, params = []) => {
      const normalized = String(sql).replace(/\s+/g, ' ').trim();
      if (/SELECT id, status FROM production_reports_temp WHERE worker_id=\? AND client_request_id=\? LIMIT 1/i.test(normalized)) {
        return requestRows.has(`${params[0]}:${params[1]}`) ? [requestRows.get(`${params[0]}:${params[1]}`)] : [];
      }
      if (/JSON_UNQUOTE\(JSON_EXTRACT\(extra_data, '\$\.gc_group_request_id'\)\)=\?/i.test(normalized)) return [];
      if (/SELECT process_code FROM processes/i.test(normalized)) return [{ process_code: 'EP' }];
      if (/SUM\(group_hours\)/i.test(normalized)) return [{ counted_hours: 0 }];
      return [];
    },
    getConnection: async () => ({ release() {} }),
    beginTransaction: async (conn) => { conn.tx = true; },
    beginReadCommittedTransaction: async (conn) => { conn.tx = true; },
    commit: async (conn) => { committed.push(conn); },
    rollback: async (conn) => { rolledBack.push(conn); },
  });
  cacheModule(trainingPath, { resolveInitialTrainingSnapshot: async () => ({ training_percent: 100 }) });
  cacheModule(capacityPath, { validateMachineWorkerCapacityLocked: async () => ({ valid: true }) });
  cacheModule(auditPath, {
    loadTempReportSnapshot: async (id) => ({ id }),
    createReportVersion: async () => 1,
  });
  delete require.cache[modelPath];
  const model = require(modelPath);

  // These methods are the persistence boundaries used by the submission service.
  // A logical-key queue models the DB row lock held until transaction completion.
  model.lockClientRequestId = async () => {};
  model.lockLogicalDuplicateKey = async () => {};
  model.lockMachineCapacityKeys = async () => {};
  model.findSimilarTempReport = async ({ workerId, processId, workDate, shift, logicalDuplicateKey }) => {
    const row = rows.find((r) =>
      r.worker_id === workerId &&
      r.process_id === processId &&
      r.work_date === workDate &&
      r.shift === shift &&
      r.logical_duplicate_key === logicalDuplicateKey &&
      ['pending', 'need_fix', 'approved'].includes(r.status)
    );
    return row ? { ...row, report_type: row.status === 'approved' ? 'approved' : 'temp' } : null;
  };
  model.findSimilarApprovedReport = async () => null;
  model.create = async (data) => {
    const id = nextId++;
    const row = { id, status: 'pending', ...data };
    rows.push(row);
    requestRows.set(`${data.worker_id}:${data.client_request_id}`, row);
    return id;
  };
  model.createDefects = async () => {};
  model.createDeductions = async () => {};
  model.replaceMachineLines = async () => {};
  model.logAction = async () => {};

  const original = model.createCompleteReport.bind(model);
  model.createCompleteReport = async (args) => {
    const key = args.data.logical_duplicate_key;
    const previous = lockQueues.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const tail = previous.then(() => gate);
    lockQueues.set(key, tail);
    await previous;
    try { return await original(args); }
    finally {
      release();
      if (lockQueues.get(key) === tail) lockQueues.delete(key);
    }
  };

  return { model, rows, committed, rolledBack };
}

function payload(overrides = {}) {
  return {
    data: {
      worker_id: 1,
      process_id: 2,
      work_date: '2026-08-13',
      shift: 'A',
      operation_mode: 'MACHINE',
      machine_no: 'M5',
      product_name: 'PX',
      logical_duplicate_key: 'a'.repeat(64),
      client_request_id: 'req-A',
      force_create: false,
      total_time: 8,
      actual_time: 8,
      deduction_time: 0,
      actual_output: 10,
      tt_ok: 10,
      tt_ng: 0,
      ...overrides,
    },
    defects: [], deductions: [], machineLines: [], audit: { userId: 9, note: 'test' },
  };
}

test('two different request IDs for same logical report serialize to one success and one duplicate conflict', async () => {
  const { model, rows } = loadCreateModelHarness();
  const results = await Promise.allSettled([
    model.createCompleteReport(payload({ client_request_id: 'A' })),
    model.createCompleteReport(payload({ client_request_id: 'B' })),
  ]);
  const successes = results.filter((r) => r.status === 'fulfilled');
  const failures = results.filter((r) => r.status === 'rejected');
  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(failures[0].reason.code, 'DUPLICATE_CONFIRMATION_REQUIRED');
  assert.equal(failures[0].reason.status, 409);
  assert.equal(rows.length, 1);
});

test('same client_request_id retry retains idempotent prior-result behavior', async () => {
  const { model, rows } = loadCreateModelHarness();
  const first = await model.createCompleteReport(payload({ client_request_id: 'SAME' }));
  const second = await model.createCompleteReport(payload({ client_request_id: 'SAME' }));
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.duplicate_reason, 'request_id');
  assert.equal(second.id, first.id);
  assert.equal(rows.length, 1);
});

test('arbitrary force_create without a server duplicate challenge cannot bypass duplicate protection', async () => {
  const { model, rows } = loadCreateModelHarness();
  await model.createCompleteReport(payload({ client_request_id: 'A' }));
  await assert.rejects(
    () => model.createCompleteReport(payload({ client_request_id: 'B', force_create: true })),
    (error) => error?.code === 'DUPLICATE_CONFIRMATION_REQUIRED' && error?.status === 409
  );
  assert.equal(rows.length, 1);
});

test('server-issued duplicate challenge allows an explicit separate run while retaining the logical lock', async () => {
  const { model, rows } = loadCreateModelHarness();
  const first = await model.createCompleteReport(payload({ client_request_id: 'A' }));
  const token = issueDuplicateConfirmation({
    workerId: 1,
    logicalDuplicateKey: first.logical_duplicate_key,
    existingReportId: first.id,
    existingReportType: 'temp',
  });
  const second = await model.createCompleteReport(payload({ client_request_id: 'B', force_create: true, duplicate_confirmation_token: token }));
  assert.equal(second.duplicate, false);
  assert.equal(rows.length, 2);
});
