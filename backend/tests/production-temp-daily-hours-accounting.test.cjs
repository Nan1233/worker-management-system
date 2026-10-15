'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const createModel = require('../models/productionTempCreateModel');
const reportModel = require('../models/productionTempModel');
const updateModel = require('../models/productionTempUpdateModel');

function callbackExecutor(handler) {
  const statements = [];
  return {
    statements,
    query(sql, params, cb) {
      statements.push({ sql: String(sql), params });
      try {
        cb(null, handler(String(sql), params || []));
      } catch (error) {
        cb(error);
      }
    },
  };
}

test('create daily cap uses actual worker hours, not gross total_time including deductions', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM workers/.test(sql)) return [{ id: 17 }];
    if (/SUM\(actual_time\)/i.test(sql)) return [{ counted_hours: 10 }];
    return [];
  });

  await assert.rejects(
    createModel._enforceDailyHoursLocked(executor, {
      worker_id: 17,
      work_date: '2026-10-14',
      actual_time: 3,
      deduction_time: 0.5,
      total_time: 3.5,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13
      && error.details?.counted_field === 'actual_time',
  );
  assert.ok(executor.statements.some(({ sql }) => /FROM workers[\s\S]*FOR UPDATE/i.test(sql)),
    'the locked guard must serialize on the worker row');
  assert.ok(executor.statements.some(({ sql }) => /SUM\(actual_time\)/i.test(sql)),
    'the guard must sum actual_time');
  assert.ok(!executor.statements.some(({ sql }) => /SUM\(total_time\)/i.test(sql)),
    'gross total_time must not be used for the 12-hour cap');
});

test('create daily cap excludes deduction time when actual work is exactly 12 hours', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM workers/.test(sql)) return [{ id: 17 }];
    if (/SUM\(actual_time\)/i.test(sql)) return [{ counted_hours: 10 }];
    return [];
  });

  await assert.doesNotReject(() => createModel._enforceDailyHoursLocked(executor, {
    worker_id: 17,
    work_date: '2026-10-14',
    actual_time: 2,
    deduction_time: 1.5,
    total_time: 3.5,
  }));
});

test('preflight daily-hours check uses actual_time so machine-line reports are not silently counted as zero', async () => {
  const executor = callbackExecutor((sql) => {
    if (/SUM\(actual_time\)/i.test(sql)) return [{ counted_hours: 10 }, { counted_hours: 0 }];
    return [];
  });

  await assert.rejects(
    reportModel.enforceDailyWorkerHours({
      worker_id: 17,
      work_date: '2026-10-14',
      actual_time: 3,
      deduction_time: 0.5,
      total_time: 3.5,
    }, executor),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED',
  );
  assert.ok(executor.statements.every(({ sql }) => !/SUM\(total_time\)/i.test(sql)));
});

test('edit daily-hours guard checks actual_time and excludes the report being edited', async () => {
  const executor = callbackExecutor((sql) => {
    if (/FROM production_reports_temp/i.test(sql)) return [{ counted_hours: 10 }];
    if (/FROM production_reports/i.test(sql)) return [{ counted_hours: 0 }];
    return [];
  });

  await assert.rejects(
    updateModel._checkDailyHours(executor, {
      workerId: 17,
      workDate: '2026-10-14',
      incomingActualHours: 3,
      excludeTempReportId: 44,
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details?.projected_hours === 13
      && error.details?.counted_field === 'actual_time',
  );
  assert.ok(executor.statements.some(({ sql, params }) =>
    /SUM\(COALESCE\(actual_time,0\)\)/i.test(sql)
      && /id <> \?/i.test(sql)
      && params.includes(44)),
  'edit check must use actual_time and exclude the current temp report');
});
