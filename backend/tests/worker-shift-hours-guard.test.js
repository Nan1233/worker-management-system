'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertWorkerShiftHours } = require('../services/workerShiftHoursGuard');

function promiseExecutor(handler) {
  const statements = [];
  return {
    statements,
    promise() {
      return {
        query: async (sql, params = []) => {
          statements.push({ sql: String(sql), params });
          return [handler(String(sql), params), []];
        }
      };
    }
  };
}

test('approved-report guard counts gross time including breaks and blocks more than 12 hours', async () => {
  const executor = promiseExecutor((sql) => {
    if (/FROM production_reports pr JOIN processes/.test(sql)) return [{
      id: 10, process_id: 1, process_code: 'CUT', actual_time: 10, deduction_time: 1, total_time: 11, source: 'approved'
    }];
    return [];
  });
  await assert.rejects(
    assertWorkerShiftHours({
      executor, workerId: 7, processId: 1, workDate: '2026-10-26', shift: 'A',
      candidate: { processCode: 'CUT', actual_time: 1, deduction_time: 1, total_time: 2 }
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details.projected_hours === 13
  );
});

test('approved-report guard uses parallel max for GC automatic machines and gross sum for sequential machines', async () => {
  const executor = promiseExecutor((sql) => {
    if (/FROM production_reports pr JOIN processes/.test(sql)) return [
      { id: 11, process_id: 1, process_code: 'GC', actual_time: 0, deduction_time: 0, total_time: 0, source: 'approved', machine_code: 'C5', machine_time_hours: 6, deduction_time_hours: 1 },
      { id: 11, process_id: 1, process_code: 'GC', actual_time: 0, deduction_time: 0, total_time: 0, source: 'approved', machine_code: 'C6', machine_time_hours: 5, deduction_time_hours: 1 },
      { id: 11, process_id: 1, process_code: 'GC', actual_time: 0, deduction_time: 0, total_time: 0, source: 'approved', machine_code: '8', machine_time_hours: 3, deduction_time_hours: 1 }
    ];
    return [];
  });
  await assert.rejects(
    assertWorkerShiftHours({
      executor, workerId: 7, processId: 1, workDate: '2026-10-26', shift: 'A',
      candidate: {
        processCode: 'GC', actual_time: 0, deduction_time: 0, total_time: 0,
        machineLines: [{ machine_code: '9', actual_time_hours: 3, deduction_time_hours: 1, machine_time_hours: 4 }]
      }
    }),
    (error) => error.code === 'DAILY_WORKING_HOURS_LIMIT_EXCEEDED'
      && error.details.projected_hours === 13
  );
  assert.ok(executor.statements[0].sql.includes('pr.shift=?'));
});
