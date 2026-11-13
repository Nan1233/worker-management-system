'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');
const { calculateEventPhysical } = require('../services/machineProductionEventService');

test('one GC physical run shared by two workers retains one physical total and separate credits', () => {
  const physical = calculateEventPhysical({
    physicalOkQuantity: 190, defects: [{ defect_code: 'BAVIA', quantity: 10 }],
    machineTimeHours: 8, standardOutput: 25
  });
  assert.equal(physical.physicalOkQuantity, 190);
  assert.equal(physical.physicalNgQuantity, 10);
  assert.equal(physical.physicalCountedOutput, 200);
  const workerLines = [
    { id: 11, machine_event_id: 701, machine_time_hours: 5, counted_output: 130 },
    { id: 12, machine_event_id: 701, machine_time_hours: 3, counted_output: 70 }
  ];
  const accounting = buildGiaCongMachineAccounting(
    { operation_mode: 'MACHINE', machineLines: workerLines },
    new Map([[701, { id: 701, machine_time_hours: 8 }]])
  );
  assert.equal(accounting.grossHours, 8);
  assert.deepEqual(workerLines.map(line => line.counted_output), [130, 70]);
  assert.equal(workerLines.reduce((total, line) => total + line.counted_output, 0), 200);
});

test('one GC worker operating several physical machines counts each event once', () => {
  const report = { operation_mode: 'MACHINE', machineLines: [
    { id: 21, machine_event_id: 801, machine_time_hours: 4, counted_output: 90 },
    { id: 22, machine_event_id: 802, machine_time_hours: 3, counted_output: 110 },
    { id: 23, machine_event_id: 801, machine_time_hours: 4, counted_output: 0 }
  ] };
  const result = buildGiaCongMachineAccounting(report, new Map([
    [801, { id: 801, machine_time_hours: 4 }],
    [802, { id: 802, machine_time_hours: 3 }]
  ]));
  assert.equal(result.grossHours, 7);
  assert.equal(result.netHours, 7);
  assert.equal(report.machineLines[0].counted_output, 90);
  assert.equal(report.machineLines[1].counted_output, 110);
});

// VM isolates the real service's lazy DB imports without touching any other
// test process or opening a production/TiDB connection.
function serviceFixture({ tempLineEventId = null } = {}) {
  const servicePath = path.resolve(__dirname, '../services/machineProductionEventService.js');
  const source = fs.readFileSync(servicePath, 'utf8');
  const state = {
    event: {
      id: 701, process_id: 1, machine_id: 5, machine_code: '5', product_code: 'PX',
      work_date: '2026-11-12', shift: 'A', status: 'pending', physical_ng_quantity: 0
    },
    tempLineEventId,
    existingEventIds: [],
    sql: [],
    transitions: 0,
    commits: 0,
    rollbacks: 0,
    auditCalls: 0,
    locked: false,
    waiters: []
  };
  async function acquire() {
    if (state.locked) await new Promise(resolve => state.waiters.push(resolve));
    state.locked = true;
  }
  function unlock() {
    if (!state.locked) return;
    state.locked = false;
    const next = state.waiters.shift();
    if (next) next();
  }
  class PromiseConnection {
    async beginTransaction() {}
    async commit() { state.commits++; unlock(); }
    async rollback() { state.rollbacks++; unlock(); }
    release() {}
    async query(sql) {
      state.sql.push(sql);
      if (/SELECT id FROM machines WHERE id=\? FOR UPDATE/.test(sql)) return [[{ id: 5 }]];
      if (/SELECT id FROM machine_production_events\s+WHERE process_id=/.test(sql)) {
        return [state.existingEventIds.map(id => ({ id }))];
      }
      if (/FROM machine_production_events e JOIN processes p/.test(sql)) {
        if (/FOR UPDATE/.test(sql)) await acquire();
        return [[{ ...state.event, process_code: 'GC' }]];
      }
      if (/SELECT ml.id, ml.machine_event_id, ml.machine_id/.test(sql)) {
        return [[{
          id: 20, machine_event_id: state.tempLineEventId,
          machine_id: 5, machine_code: '5', product_code: 'PX',
          report_id: 99, worker_id: 11, process_id: 1,
          work_date: '2026-11-12', shift: 'A', status: 'pending'
        }]];
      }
      if (/UNION ALL/.test(sql)) return [[
        { worker_id: 11, machine_line_id: 20 },
        { worker_id: 12, machine_line_id: 21 }
      ]];
      if (/FROM machines WHERE id=/.test(sql)) {
        return [[{ machine_code: '5', max_workers_per_machine: 4, is_automatic: 1, output_basis: 'MACHINE' }]];
      }
      if (/FROM machine_production_event_defects/.test(sql)) return [[]];
      if (/UPDATE production_temp_machine_lines SET machine_event_id/.test(sql)) {
        state.tempLineEventId = 701;
        return [{ affectedRows: 1 }];
      }
      if (/UPDATE machine_production_events SET status='approved'/.test(sql)) {
        if (state.event.status !== 'pending') return [{ affectedRows: 0 }];
        state.transitions++;
        state.event.status = 'approved';
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected SQL: ' + sql);
    }
  }
  const db = {
    promise() {
      return {
        getConnection: async () => new PromiseConnection(),
        query: async (sql, params) => new PromiseConnection().query(sql, params)
      };
    }
  };
  const fakeRequire = request => {
    if (request === '../config/db') return db;
    if (request === './auditService') return {
      logActivity: async () => { state.auditCalls++; }
    };
    if (request === './processAuthorizationService') return {
      assertProcessScope: async () => true
    };
    return require(require.resolve(request, { paths: [path.dirname(servicePath)] }));
  };
  const moduleObj = { exports: {} };
  const wrapper = vm.runInNewContext('(function (require, module, exports) {\n' + source + '\n})', {
    console, setImmediate, setTimeout, clearTimeout
  }, { filename: servicePath });
  wrapper(fakeRequire, moduleObj, moduleObj.exports);
  return { service: moduleObj.exports, state };
}

test('a machine line already linked to a different event cannot be reassigned', async () => {
  const { service, state } = serviceFixture({ tempLineEventId: 999 });
  await assert.rejects(
    service.linkParticipants({ id: 701, actor: { id: 3, role: 'manager' }, tempMachineLineIds: [20] }),
    error => error.code === 'MACHINE_LINE_ALREADY_LINKED' && error.status === 409
  );
  assert.equal(state.tempLineEventId, 999);
  assert.equal(state.commits, 0);
  assert.equal(state.rollbacks, 1);
  assert.equal(state.auditCalls, 0);
});

test('two concurrent approvals of the same event yield exactly one transition', async () => {
  const { service, state } = serviceFixture();
  const actor = { id: 3, role: 'manager' };
  const results = await Promise.allSettled([
    service.approveEvent({ id: 701, actor }),
    service.approveEvent({ id: 701, actor })
  ]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  const failure = results.find(item => item.status === 'rejected');
  assert.equal(failure.reason.code, 'MACHINE_EVENT_ALREADY_REVIEWED');
  assert.equal(state.transitions, 1);
  assert.equal(state.auditCalls, 1);
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 1);
});

test('duplicate machine/product/date/shift event is rejected under machine lock', async () => {
  const { service, state } = serviceFixture();
  state.existingEventIds = [700];
  await assert.rejects(
    service.assertUniquePhysicalEvent({
      constructor: { name: 'PromiseConnection' },
      query: async sql => {
        state.sql.push(sql);
        if (/FROM machines WHERE/.test(sql)) return [[{ id: 5 }]];
        if (/FROM machine_production_events/.test(sql)) return [[{ id: 700 }]];
        throw new Error('Unexpected SQL');
      }
    }, {
      processId: 1, machineId: 5, productCode: 'PX',
      workDate: '2026-11-12', shift: 'A'
    }),
    error => error.code === 'MACHINE_EVENT_ALREADY_EXISTS' && error.status === 409
  );
  assert.match(state.sql[0], /FROM machines WHERE id=\\? FOR UPDATE/);
  assert.match(state.sql[1], /FROM machine_production_events[\\s\\S]*FOR UPDATE/);
});

test('event edit preserves identity and checks a new identity before changing dimensions', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../services/machineProductionEventService.js'), 'utf8');
  assert.match(source, /if \\(dimensionsChanged\\) await assertUniquePhysicalEvent/);
  assert.match(source, /excludeEventId: before\\.id/);
  assert.match(source, /await assertUniquePhysicalEvent\\(connection, \\{ processId: ctx\\.process\\.id/);
});
