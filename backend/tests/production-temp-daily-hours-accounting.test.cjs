'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '../config/db' || request.endsWith('/config/db')) {
    const inert = () => { throw new Error('real database must not be used in this test'); };
    return { promise: inert, query: inert, getConnection: inert, execute: inert };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const createModel = require('../models/productionTempCreateModel');
const reportModel = require('../models/productionTempModel');
const updateModel = require('../models/productionTempUpdateModel');
Module._load = originalLoad;

function callbackExecutor(handler) {
  const statements = [];
  return {
    statements,
    query(sql, params, cb) {
      statements.push({ sql: String(sql), params });
      try { cb(null, handler(String(sql), params || [])); }
      catch (error) { cb(error); }
    },
  };
}

test('create daily cap counts non-multi-machine actual hours and locks the worker row', async () => {
  const executor = callbackExecutor((sql) => {
    if (sql.includes('FROM workers')) return [{ id: 17 }];
    if (sql.includes('FROM processes')) return [{ process_code: 'CUT' }];
    if (sql.includes('FROM production_reports pr JOIN processes p')) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.rejects(
    createModel._enforceDailyHoursLocked(executor, {
      worker_id: 17, process_id: 1, work_date: '2026-10-14',
      actual_time: 3, deduction_time: 0.5, total_time: 3.5,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13,
  );
  assert.ok(executor.statements.some(({ sql }) => sql.includes('FROM workers') && sql.includes('FOR UPDATE')));
  assert.ok(executor.statements.some(({ sql }) => sql.includes('process_code NOT IN')));
  assert.ok(!executor.statements.some(({ sql }) => sql.includes('SUM(total_time)')));
});

test('create daily cap permits exactly 12 actual hours', async () => {
  const executor = callbackExecutor((sql) => {
    if (sql.includes('FROM workers')) return [{ id: 17 }];
    if (sql.includes('FROM processes')) return [{ process_code: 'CUT' }];
    if (sql.includes('FROM production_reports pr JOIN processes p')) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.doesNotReject(() => createModel._enforceDailyHoursLocked(executor, {
    worker_id: 17, process_id: 1, work_date: '2026-10-14',
    actual_time: 2, deduction_time: 1.5, total_time: 3.5,
  }));
});

test('GC and MAI preflight are exempt from the combined worker/day cap', async () => {
  for (const processCode of ['GC', 'MAI']) {
    const executor = callbackExecutor((sql) => {
      if (sql.includes('FROM processes')) return [{ process_code: processCode }];
      return [];
    });
    await assert.doesNotReject(() => reportModel.enforceDailyWorkerHours({
      worker_id: 17, process_id: 2, process_code: processCode, work_date: '2026-10-14',
      actual_time: 0, machine_lines: [],
    }, executor, [{ actual_time_hours: 8 }, { actual_time_hours: 8 }]));
    assert.equal(executor.statements.some(({ sql }) => sql.includes('SUM(counted_hours)')), false);
  }
});

test('edit daily-hours guard exempts GC and still enforces the cap for regular processes', async () => {
  const exemptExecutor = callbackExecutor(() => []);
  await assert.doesNotReject(() => updateModel._checkDailyHours(exemptExecutor, {
    workerId: 17, workDate: '2026-10-14', incomingActualHours: 0,
    processCode: 'GC', excludeTempReportId: 44,
  }));
  assert.equal(exemptExecutor.statements.length, 0);

  const regularExecutor = callbackExecutor((sql) => {
    if (sql.includes('FROM production_reports pr JOIN processes p')) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.rejects(() => updateModel._checkDailyHours(regularExecutor, {
    workerId: 17, workDate: '2026-10-14', incomingActualHours: 3,
    processCode: 'CUT', excludeTempReportId: 44,
  }), (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
    && error.details?.projected_hours === 13);
  assert.ok(regularExecutor.statements.some(({ sql, params }) =>
    sql.includes('production_reports_temp') && sql.includes('pr.id <> ?') && params.includes(44)));
});
