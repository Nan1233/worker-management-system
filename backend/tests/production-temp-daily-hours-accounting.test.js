'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.includes('config/db')) {
    const inert = () => { throw new Error('real database must not be used in this test'); };
    return { promise: inert, query: inert, getConnection: inert, execute: inert };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const createModel = require('../models/productionTempCreateModel');
const reportModel = require('../models/productionTempModel');
const updateModel = require('../models/productionTempUpdateModel');
const { calculateGcShiftHours } = require('../utils/gcShiftHours');
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

const reportsQuery = /SELECT pr\.id, pr\.process_id, p\.process_code[\s\S]*FROM production_reports pr JOIN processes p/i;

test('create daily cap includes break time and locks the worker row', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM workers/.test(sql)) return [{ id: 17 }];
    if (/SELECT process_code FROM processes/.test(sql)) return [{ process_code: 'CUT' }];
    if (reportsQuery.test(sql)) return [{ id: 1, process_code: 'CUT', source: 'approved', actual_time: 10, deduction_time: 0, total_time: 10 }];
    return [];
  });
  await assert.rejects(
    createModel._enforceDailyHoursLocked(executor, {
      worker_id: 17, process_id: 1, work_date: '2026-10-14', shift: 'A',
      actual_time: 3, deduction_time: 0.5, total_time: 3.5,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13.5,
  );
  assert.ok(executor.statements.some(({ sql }) => sql.includes('FROM workers') && sql.includes('FOR UPDATE')));
});

test('exactly 12 gross hours in one shift are accepted', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM workers/.test(sql)) return [{ id: 17 }];
    if (/SELECT process_code FROM processes/.test(sql)) return [{ process_code: 'CUT' }];
    if (reportsQuery.test(sql)) return [{ id: 1, process_code: 'CUT', source: 'approved', actual_time: 10, deduction_time: 0, total_time: 10 }];
    return [];
  });
  await assert.doesNotReject(() => createModel._enforceDailyHoursLocked(executor, {
    worker_id: 17, process_id: 1, work_date: '2026-10-14', shift: 'A',
    actual_time: 1, deduction_time: 1, total_time: 2,
  }));
});

test('GC preflight counts automatic machines in parallel across the shift and other machines sequentially', async () => {
  const executor = callbackExecutor((sql) => {
    if (/SELECT process_code FROM processes/.test(sql)) return [{ process_code: 'GC' }];
    if (reportsQuery.test(sql)) return [{ id: 20, process_code: 'GC', source: 'approved', actual_time: 0, deduction_time: 0, total_time: 0 }];
    if (/FROM production_report_machine_lines WHERE report_id IN/.test(sql)) return [
      { parent_id: 20, machine_code: 'C5', machine_time_hours: 6 },
      { parent_id: 20, machine_code: 'C6', machine_time_hours: 5 },
      { parent_id: 20, machine_code: '8', machine_time_hours: 2 }
    ];
    return [];
  });
  await assert.rejects(
    reportModel.enforceDailyWorkerHours({
      worker_id: 17, process_id: 2, process_code: 'GC', work_date: '2026-10-14', shift: 'A', actual_time: 0,
    }, executor, [
      { machine_code: '5', actual_time_hours: 3, machine_time_hours: 3 },
      { machine_code: '6', actual_time_hours: 4, machine_time_hours: 4 },
      { machine_code: '9', actual_time_hours: 1, machine_time_hours: 1 }
    ]),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.existing_hours === 8
      && error.details?.incoming_hours === 5
      && error.details?.projected_hours === 13,
  );
});

test('GC gross hours use max for automatic machines and include breaks', () => {
  assert.equal(calculateGcShiftHours([
    { machine_code: 'C5', actual_time_hours: 3, deduction_time_hours: 0.5, machine_time_hours: 3.5 },
    { machine_code: 'M6', actual_time_hours: 4, deduction_time_hours: 0.5, machine_time_hours: 4.5 },
    { machine_code: '8', actual_time_hours: 2, deduction_time_hours: 0.5, machine_time_hours: 2.5 },
    { machine_code: '9', actual_time_hours: 1, deduction_time_hours: 0.25, machine_time_hours: 1.25 },
  ]), 8.25);
});

test('edit guard excludes the report being edited and validates against the selected shift', async () => {
  const executor = callbackExecutor((sql) => {
    if (reportsQuery.test(sql)) return [{ id: 20, process_code: 'GC', source: 'approved', actual_time: 0, deduction_time: 0, total_time: 0 }];
    if (/FROM production_report_machine_lines WHERE report_id IN/.test(sql)) return [
      { parent_id: 20, machine_code: 'C5', machine_time_hours: 10 }
    ];
    return [];
  });
  await assert.rejects(
    updateModel._checkDailyHours(executor, {
      workerId: 17, workDate: '2026-10-14', shift: 'A', incomingActualHours: 0,
      incomingMachineLines: [{ machine_code: '8', actual_time_hours: 3, machine_time_hours: 3 }],
      isGc: true, excludeTempReportId: 44,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13,
  );
  assert.ok(executor.statements.some(({ sql, params }) =>
    sql.includes('production_reports_temp') && sql.includes('pr.id <> ?') && params.includes(44)));
});
