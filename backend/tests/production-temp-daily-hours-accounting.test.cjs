'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// The models import the real DB pool, which keeps `node --test` alive forever. Every query in this file goes
// through an explicit fake executor, so load the models with an inert db module.
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (/(^|\/)config\/db$/.test(request)) {
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

const gcAwareHoursQuery = /FROM production_reports pr JOIN processes p/i;

test('GC shift hours count machines 5/6/7/11 in parallel and all other machines sequentially, including breaks', () => {
  assert.equal(calculateGcShiftHours([
    { machine_code: 'C5', actual_time_hours: 3, deduction_time_hours: 0.5, machine_time_hours: 3.5 },
    { machine_code: 'M6', actual_time_hours: 4, deduction_time_hours: 0.5, machine_time_hours: 4.5 },
    { machine_code: '8', actual_time_hours: 2, deduction_time_hours: 0.5, machine_time_hours: 2.5 },
    { machine_code: '9', actual_time_hours: 1, deduction_time_hours: 0.25, machine_time_hours: 1.25 },
  ]), 8.25);
});

test('create daily cap counts gross shift hours including deductions and locks the worker row', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM workers/.test(sql)) return [{ id: 17 }];
    if (/FROM processes/.test(sql)) return [{ process_code: 'CUT' }];
    if (gcAwareHoursQuery.test(sql)) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.rejects(
    createModel._enforceDailyHoursLocked(executor, {
      worker_id: 17, process_id: 1, work_date: '2026-10-14', shift: 'A',
      actual_time: 3, deduction_time: 0.5, total_time: 3.5,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13.5
      && error.details?.counted_field === 'gross_elapsed_hours_by_shift',
  );
  assert.ok(executor.statements.some(({ sql }) => /FROM workers[\s\S]*FOR UPDATE/i.test(sql)));
  assert.ok(executor.statements.some(({ sql }) => /production_report_machine_lines/.test(sql)));
  assert.ok(!executor.statements.some(({ sql }) => /SUM\(total_time\)/i.test(sql)));
});

test('create daily cap includes deduction time in gross shift hours', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM workers/.test(sql)) return [{ id: 17 }];
    if (/FROM processes/.test(sql)) return [{ process_code: 'CUT' }];
    if (gcAwareHoursQuery.test(sql)) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.rejects(() => createModel._enforceDailyHoursLocked(executor, {
    worker_id: 17, process_id: 1, work_date: '2026-10-14', shift: 'A',
    actual_time: 2, deduction_time: 1.5, total_time: 3.5,
  }), (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED' && error.details?.projected_hours === 13.5);
});

test('GC preflight counts automatic machines in parallel and other machines sequentially', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM processes/.test(sql)) return [{ process_code: 'GC' }];
    if (gcAwareHoursQuery.test(sql)) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.rejects(
    reportModel.enforceDailyWorkerHours({
      worker_id: 17, process_id: 2, process_code: 'GC', work_date: '2026-10-14', shift: 'A',
      actual_time: 0, machine_lines: [],
    }, executor, [{ machine_code: '5', actual_time_hours: 3, machine_time_hours: 3 }, { machine_code: '6', actual_time_hours: 4, machine_time_hours: 4 }]),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 14,
  );
});

test('existing GC reports use gross machine time for the same shift', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM processes/.test(sql)) return [{ process_code: 'GC' }];
    if (gcAwareHoursQuery.test(sql)) return [{ counted_hours: 9 }];
    return [];
  });
  await assert.rejects(
    reportModel.enforceDailyWorkerHours({
      worker_id: 17, process_id: 2, process_code: 'GC', work_date: '2026-10-14', shift: 'A', actual_time: 0,
    }, executor, [{ actual_time_hours: 4 }]),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13,
  );
  assert.ok(executor.statements.some(({ sql }) => /COALESCE\(SUM\(CASE WHEN/i.test(sql)));
});

test('edit daily-hours guard excludes the report being edited and counts GC machine-line time', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM production_reports pr JOIN processes p/i.test(sql)) return [{ counted_hours: 10 }];
    return [];
  });
  await assert.rejects(
    updateModel._checkDailyHours(executor, {
      workerId: 17, workDate: '2026-10-14', shift: 'A', incomingActualHours: 0,
      incomingMachineLines: [{ actual_time_hours: 3 }], isGc: true, excludeTempReportId: 44,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13
      && error.details?.counted_field === 'gross_elapsed_hours_by_shift',
  );
  assert.ok(executor.statements.some(({ sql, params }) =>
    /production_temp_machine_lines/.test(sql) && /pr\.id <> \?/i.test(sql) && params.includes(44)));
});
