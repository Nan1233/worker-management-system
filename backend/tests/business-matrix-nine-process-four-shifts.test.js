'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getVietnamDateKey } = require('../utils/dateKey');
const { validateProductionReport } = require('../utils/reportValidation');
const { PROCESS_IDS, normalizeProcessId, getProcessMachinePolicy } = require('../services/processMachinePolicy');
const { calculateProductionMetrics } = require('../domain/productionCalculationEngine.cjs');
const { assertActorProcessAccess, assertWorkerOwnership } = require('../services/processAuthorizationService');
const { shouldSplitMachineReports, childRequestId, groupMaiMachineProductLines } = require('../services/productionMachineReportGrouping');
const { addGiaCongPhysicalMachineHours } = require('../services/giaCongPhysicalMachineHours');

const CODES = ['GC', 'MAI', 'DO', 'K1', 'K2', 'CAN', 'EP', 'XLBV', 'SX3'];
const SHIFTS = ['A', 'B', 'C', 'D'];
const samples = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/process-form-test-data.json'), 'utf8'));
const fixture = new Map(samples.filter(row => row.shift === 'A').map(row => [row.process_code, row]));
const SETTINGS = {
  apply_training_percent: 1, output_formula: 'OK_PLUS_NG',
  output_per_hour_formula: 'ADJUSTED_OUTPUT_DIV_ACTUAL_TIME',
  achievement_formula: 'OUTPUT_PER_HOUR_DIV_STANDARD',
  ng_rate_formula: 'NG_DIV_OK_PLUS_NG', actual_time_formula: 'DATABASE_SNAPSHOT',
};

test('fixture baseline has all nine process codes, two real historical shifts and canonical identities are taken from runtime', () => {
  assert.deepEqual([...fixture.keys()].sort(), [...CODES].sort());
  assert.deepEqual([...new Set(samples.map(row=>row.shift))].sort(), ['A','B']);
  for (const code of CODES) {
    const policy = getProcessMachinePolicy(PROCESS_IDS[code]);
    assert.equal(policy.code,code);
    assert.ok(policy.maxMachines >= policy.minMachines);
  }
  for(const [oldId,code] of [[60001,'DO'],[60002,'CAN'],[60003,'EP'],[60004,'XLBV'],[60005,'SX3']]) {
    assert.equal(normalizeProcessId(oldId),PROCESS_IDS[code]);
  }
  // K1/K2 have stale IDs in archived form fixtures. Never trust fixture process_id as authority.
  const stale = CODES.filter(code => normalizeProcessId(fixture.get(code).process_id) !== PROCESS_IDS[code]);
  assert.deepEqual(stale,['K1','K2']);
});

function reportFor(code,shift) {
  const sample=fixture.get(code);
  return {
    ...sample,
    process_id:PROCESS_IDS[code], // canonical mapping from running backend
    work_date:getVietnamDateKey(),
    entry_date:getVietnamDateKey(),
    shift,
    defects:[{ defect_type_id:1, defect_name:'KQD',quantity:2 }],
    deductions:[{ deduction_type_id:1,deduction_name:'5S',hours:0.5 }],
  };
}

for(const code of CODES) for(const shift of SHIFTS) {
  test(`${code}/ca ${shift}: report totals, NG, deductions, KQD, 12h and KPI agree with actual validator`, () => {
    const sample = reportFor(code,shift);
    const result = validateProductionReport(sample);
    assert.equal(result.valid,true,JSON.stringify({code,shift,errors:result.errors}));
    assert.equal(result.normalized.shift,shift);
    assert.equal(result.normalized.tt_ok,96);
    assert.equal(result.normalized.tt_ng,2);
    assert.equal(result.normalized.actual_output,98);
    assert.equal(result.normalized.actual_time,7.5);
    assert.equal(result.normalized.deduction_time,0.5);
    assert.equal(result.normalized.defects[0].quantity,2);
    assert.equal(result.normalized.deductions[0].hours,0.5);
    const metrics=calculateProductionMetrics({
      ...result.normalized, training_percent_snapshot:100,
    },SETTINGS);
    assert.equal(metrics.allNg,2);
    assert.equal(metrics.enteredOutput,98);
    assert.equal(metrics.adjustedOutput,98);
    assert.ok(Math.abs(metrics.outputPerHour-98/7.5)<0.0001);
    assert.ok(Math.abs(metrics.ngRate-2/98)<0.0001);

    // Invalid input must be rejected by the actual runtime validator, not a clone.
    const ngMismatch=validateProductionReport({...sample,tt_ng:3});
    assert.equal(ngMismatch.valid,false);
    assert.ok(ngMismatch.errors.tt_ng,code+'/'+shift+' NG mismatch');
    const deductionMismatch=validateProductionReport({
      ...sample,deduction_time:0.25,total_time:7.75,
    });
    assert.equal(deductionMismatch.valid,false);
    assert.ok(deductionMismatch.errors.deduction_time,code+'/'+shift+' deduction mismatch');
    const tooLong=validateProductionReport({
      ...sample,actual_time:12.1,total_time:12.6,
    });
    assert.equal(tooLong.valid,false);
    assert.ok(tooLong.errors.actual_time || tooLong.errors.total_time,code+'/'+shift+' >12h');
  });
}

function fakeProcessAssignments(actorId, processId) {
  return {
    async query(sql, params) {
      const table=sql.includes('worker_processes')?'worker_processes':
        sql.includes('manager_processes')?'manager_processes':null;
      assert.ok(table, 'authorization checks must query DB-owned scope');
      const ok=Number(params[0])===actorId && Number(params[1])===processId;
      return [ok?[{ allowed:1 }]:[],[]];
    }
  };
}
const DENIED = e => e?.status===403 && e?.code==='PROCESS_SCOPE_FORBIDDEN';
for(const code of CODES) for(const shift of SHIFTS) {
  test(`${code}/ca ${shift}: admin, manager, lead, worker roles cannot cross process scope`, async () => {
    const processId=PROCESS_IDS[code];
    const executor=fakeProcessAssignments(41,processId);
    // Shift is not part of an access grant; no shift can broaden process scope.
    assert.equal(await assertActorProcessAccess({ id:1,role:'admin' },processId,{executor}),true);
    for(const role of ['manager','lead','worker']) {
      const actor=role==='worker'?{id:88,role,worker_id:41}:{id:41,role};
      assert.equal(await assertActorProcessAccess(actor,processId,{executor}),true);
      const outside=PROCESS_IDS[CODES.find(other=>other!==code)];
      await assert.rejects(
        assertActorProcessAccess(actor,outside,{executor}),
        DENIED,role+' may not access other process from shift '+shift
      );
    }
    assert.equal(assertWorkerOwnership({role:'worker',worker_id:41},41),true);
    assert.throws(()=>assertWorkerOwnership({role:'worker',worker_id:41},42),
      e=>e.status===403 && e.code==='WORKER_OWNERSHIP_FORBIDDEN');
  });
}

test('machine policies for all nine processes are checked against live modules, not outdated form fixture IDs', () => {
  const baseline = {
    GC:['MANUAL_OR_SMART_MACHINE',4],MAI:['MULTI_MACHINE_OPTIONAL',10],
    DO:['MULTI_MACHINE_OPTIONAL',10],K1:['MANUAL_OR_SINGLE_MACHINE',1],
    K2:['MANUAL_OR_SINGLE_MACHINE',1],CAN:['MULTI_MACHINE_OPTIONAL',10],
    EP:['MULTI_MACHINE_REQUIRED',10],XLBV:['MANUAL_ONLY',0],SX3:['MANUAL_ONLY',0],
  };
  for(const code of CODES){
    const policy=getProcessMachinePolicy(PROCESS_IDS[code]);
    assert.deepEqual([policy.mode,policy.maxMachines],baseline[code],code);
  }
  // Baseline != approved factory specification: current DO/CAN/EP max=10
  // contradicts documentation/comments suggesting smaller values. Track separately;
  // never change operational limits just to make a test pass.
});

test('split rules across all nine processes and four shifts keep request IDs stable', () => {
  const lineA={machine_code:'M01',product_code:'P01',ok_quantity:5,ng_quantity:1};
  const lineB={machine_code:'M02',product_code:'P02',ok_quantity:6,ng_quantity:0};
  for(const code of CODES)for(const shift of SHIFTS){
    const report={process_code:code,shift,process_id:PROCESS_IDS[code],work_date:getVietnamDateKey()};
    assert.equal(shouldSplitMachineReports(report,[lineA,lineB]),
      ['GC','MAI','DO','CAN','EP'].includes(code),code+'/'+shift);
    assert.equal(shouldSplitMachineReports(report,[lineA]),false);
    assert.equal(childRequestId(`group-${code}-${shift}`,[lineA],0),
      childRequestId(`group-${code}-${shift}`,[lineA],0));
    assert.notEqual(childRequestId(`group-${code}-${shift}`,[lineA],0),
      childRequestId(`group-${code}-${shift}`,[lineB],0));
  }
  const grouped=groupMaiMachineProductLines([
    { ...lineA, machine_time_hours:2, counted_output:6,
      defects:[{quantity:1}],deductions:[{hours:0.5}] },
    { ...lineA,machine_code:'m01', product_code:'p01',machine_time_hours:3,
      counted_output:8,defects:[{quantity:2}],deductions:[{hours:0.25}] },
  ]);
  assert.equal(grouped.length,1);
  assert.equal(grouped[0].machine_time_hours,5);
  assert.equal(grouped[0].counted_output,14);
  assert.equal(grouped[0].defects.length,2);
  assert.equal(grouped[0].deductions.length,2);
});

test('shared physical machine time is counted once, while worker credits remain separate', () => {
  const events=new Map([[101,{machine_time_hours:8}]]);
  const seen=new Set();
  let hours=0;
  for(const workerId of [41,42,43,44]) {
    const step=addGiaCongPhysicalMachineHours({
      line:{machine_event_id:101,machine_time_hours:2,worker_id:workerId},
      events,seenEvents:seen,grossHours:hours,
    });
    hours=step.grossHours;
    assert.equal(step.hasPhysicalEvent,true);
    assert.equal(hours,8,'worker participants must not multiply physical output/time');
  }
  const missing=addGiaCongPhysicalMachineHours({
    line:{machine_event_id:999,machine_time_hours:8},
    events,seenEvents:new Set(),grossHours:0,
  });
  assert.equal(missing.grossHours,0,'missing physical event must fail closed');
});
