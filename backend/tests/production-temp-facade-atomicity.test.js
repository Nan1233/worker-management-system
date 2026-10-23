'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadFacadeHarness() {
  const persisted = [];
  const sqlLog = [];
  let nextId = 100;
  let failNextDetails = true;
  const connections = [];

  const db = {};
  const query = async (executor, sql, params = []) => {
    const text = String(sql).replace(/\\s+/g, ' ').trim();
    sqlLog.push(text);
    if (/SUM\\(counted_hours\\)/i.test(text)) return [{ counted_hours: 0 }];
    if (/SELECT process_code FROM processes/i.test(text)) return [{ process_code: 'EP' }];
    if (/FROM production_reports_temp WHERE worker_id=\\? AND client_request_id=\\?/i.test(text)) {
      const row = persisted.find((item) => item.worker_id === Number(params[0]) && item.client_request_id === String(params[1]));
      return row ? [{ id: row.id, status: row.status }] : [];
    }
    return [];
  };

  const getConnection = async () => {
    const connection = { pendingReport: null, released: false, release() { this.released = true; } };
    connections.push(connection);
    return connection;
  };
  const commit = async (connection) => {
    if (connection.pendingReport) persisted.push(connection.pendingReport);
    connection.pendingReport = null;
  };
  const rollback = async (connection) => { connection.pendingReport = null; };
  const createModel = {
    findSimilarTempReport: async () => null,
    findSimilarApprovedReport: async () => null,
    create: async (data, connection) => {
      const id = nextId++;
      connection.pendingReport = {
        id, worker_id: Number(data.worker_id),
        client_request_id: String(data.client_request_id),
        status: 'pending', detailsSaved: false
      };
      return id;
    },
    createDefects: async (id, processId, defects, connection) => {
      if (failNextDetails) {
        failNextDetails = false;
        const error = new Error('simulated child detail lock/write failure');
        error.code = 'ER_LOCK_WAIT_TIMEOUT';
        error.errno = 1205;
        throw error;
      }
      if (connection.pendingReport?.id === id) connection.pendingReport.defectsSaved = true;
    },
    createDeductions: async (id, processId, deductions, connection) => {
      if (connection.pendingReport?.id === id) connection.pendingReport.deductionsSaved = true;
    },
    replaceMachineLines: async (id, lines, connection) => {
      if (connection.pendingReport?.id === id) connection.pendingReport.machineLinesSaved = true;
      if (connection.pendingReport?.id === id) connection.pendingReport.detailsSaved = true;
    },
    logAction: async () => {},
  };

  const shared = {
    query, getConnection,
    beginTransaction: async () => {},
    beginReadCommittedTransaction: async () => {},
    commit, rollback,
    editableFields: [],
  };
  const audit = {
    loadTempReportSnapshot: async (id) => ({ id }),
    createReportVersion: async () => {},
    logActivity: async () => {},
  };
  const mocks = new Map([
    ['../config/db', db],
    ['./productionTempCreateModel', createModel],
    ['./nonProductWorkCreateModel', { createCompleteReport: async () => { throw new Error('unexpected CVK path'); } }],
    ['./productionTempReadModel', {}],
    ['./productionTempReviewModel', {}],
    ['./productionTempHistoryModel', {}],
    ['./productionTempUpdateModel', {}],
    ['./productionTempModelShared', shared],
    ['../services/auditService', audit],
    ['../services/trainingSnapshotService', { resolveInitialTrainingSnapshot: async () => 100 }],
    ['../services/factoryMachineRuleService', { validateMachineWorkerCapacityLocked: async () => ({ valid: true }) }],
    ['../services/logicalDuplicateReportService', { buildLogicalDuplicateKey: () => 'logical-key' }],
    ['../services/duplicateConfirmationService', { verifyDuplicateConfirmation: () => ({ valid: true }) }],
    ['../utils/dailyHoursLimit', { DAILY_HOURS_LIMIT: 12, exceedsDailyHoursLimit: (hours) => hours > 12 }],
  ]);

  const originalLoad = Module._load;
  const facadePath = require.resolve('../models/productionTempModel');
  delete require.cache[facadePath];
  Module._load = function (request, parent, ...rest) {
    if (mocks.has(request)) return mocks.get(request);
    return originalLoad.call(this, request, parent, ...rest);
  };
  let facade;
  try { facade = require(facadePath); }
  finally { Module._load = originalLoad; }

  return { facade, persisted, sqlLog, connections };
}

const payload = () => ({
  data: {
    worker_id: 7, process_id: 3, work_date: '2026-10-23',
    shift: 'DAY', client_request_id: 'same-request-id',
    actual_time: 1, total_time: 1, deduction_time: 0,
    tt_ok: 10, tt_ng: 0, operation_mode: 'MANUAL',
    product_name: 'P1', extra_data: {}
  },
  defects: [], deductions: [], machineLines: [],
  audit: { userId: 9, note: 'atomicity regression test' }
});

test('child lock/write failure rolls back parent; retry with same request ID creates a complete report', async () => {
  const { facade, persisted, sqlLog } = loadFacadeHarness();

  await assert.rejects(
    () => facade.createCompleteReport(payload()),
    (error) => error.code === 'ER_LOCK_WAIT_TIMEOUT'
      && error.status === 409
  );

  assert.equal(persisted.length, 0, 'a failed child write must not leave a committed parent report');
  assert.equal(
    sqlLog.some((sql) => /UPDATE production_reports_temp SET status='need_fix'/i.test(sql)),
    false,
    'a storage failure must not mutate the report into a business-review status'
  );

  const retry = await facade.createCompleteReport(payload());
  assert.equal(retry.duplicate, false);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].client_request_id, 'same-request-id');
  assert.equal(persisted[0].status, 'pending');
  assert.equal(persisted[0].detailsSaved, true);
  assert.equal(persisted[0].defectsSaved, true);
  assert.equal(persisted[0].deductionsSaved, true);
  assert.equal(persisted[0].machineLinesSaved, true);
});
