const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateEventPhysical, isSharedEventManaged, assertApprovedEventForTempLine } = require('../services/machineProductionEventService');
const { validateMachineWorkerCapacityLocked } = require('../services/factoryMachineRuleService');
const { buildGiaCongMachineAccounting } = require('../services/giaCongMachineAccounting');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');

function callbackExecutor(handler) {
  return { query(sql, params, cb) { try { cb(null, handler(sql, params)); } catch (e) { cb(e); } } };
}

test('physical event output is independent from worker credits and treats KQD as normal NG', () => {
  const result = calculateEventPhysical({
    physicalOkQuantity: 990,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 },
    ],
    machineTimeHours: 1,
    standardOutput: 1000,
  });
  assert.equal(result.physicalNgQuantity, 10);
  assert.equal(result.physicalTotalOutput, 1000);
  assert.equal(result.physicalCountedOutput, 1000);
  assert.equal(result.maximumOutput, 1000);
  // Worker credits are intentionally not an input to physical calculation.
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'workerCredit'), false);
});

test('unconfigured KQD_TEST remains a normal physical defect', () => {
  const result = calculateEventPhysical({
    physicalOkQuantity: 990,
    defects: [{ defect_code: 'KQD_TEST', quantity: 10 }],
    machineTimeHours: 1,
    standardOutput: 1000,
  });
  assert.equal(result.physicalNgQuantity, 10);
  assert.equal(result.physicalCountedOutput, 1000);
});

test('only GC 5/6/7/11 require shared event accounting', () => {
  for (const code of ['5', 'M6', 'MAY-7', 'Máy 11']) assert.equal(isSharedEventManaged('GC', code), true, code);
  assert.equal(isSharedEventManaged('GC', '8'), false);
  assert.equal(isSharedEventManaged('MAI', '5'), false);
});

test('approval hard-block accepts only matching approved event', async () => {
  const good = callbackExecutor((sql) => {
    if (/SELECT process_code FROM processes/.test(sql)) return [{ process_code: 'GC' }];
    if (/FROM machine_production_events/.test(sql)) return [{ id: 123, process_id: 1, machine_id: 5, machine_code: '5', product_code: 'PX', work_date: '2026-08-12', shift: 'A', status: 'approved' }];
    return [];
  });
  await assert.doesNotReject(() => assertApprovedEventForTempLine(good, {
    report: { process_id: 1, work_date: '2026-08-12', shift: 'A' },
    line: { machine_event_id: 123, machine_id: 5, machine_code: '5', product_code: 'PX' },
  }));

  const noEvent = callbackExecutor((sql) => /SELECT process_code FROM processes/.test(sql) ? [{ process_code: 'GC' }] : []);
  await assert.rejects(() => assertApprovedEventForTempLine(noEvent, {
    report: { process_id: 1, work_date: '2026-08-12', shift: 'A' },
    line: { machine_event_id: null, machine_id: 5, machine_code: '5', product_code: 'PX' },
  }), (error) => error.code === 'MACHINE_EVENT_REQUIRED');
});

test('transactional worker-capacity check locks machine row before counting participants', async () => {
  const statements = [];
  const executor = callbackExecutor((sql) => {
    statements.push(sql.replace(/\s+/g, ' ').trim());
    if (/FROM machines/.test(sql) && /FOR UPDATE/.test(sql)) {
      return [{ id: 5, process_id: 1, machine_code: '5', is_automatic: 1, max_workers_per_machine: 4, output_basis: 'MACHINE' }];
    }
    if (/SELECT DISTINCT worker_id/.test(sql)) return [{ worker_id: 1, machine_code: '5' }, { worker_id: 2, machine_code: '5' }, { worker_id: 3, machine_code: '5' }];
    return [];
  });
  const fourth = await validateMachineWorkerCapacityLocked({ executor, processCode: 'GC', processId: 1, machineLines: [{ machine_code: '5' }], workerId: 4, workDate: '2026-08-12', shift: 'A' });
  assert.equal(fourth.valid, true);
  assert.match(statements[0], /ORDER BY id FOR UPDATE/);

  const fifthExecutor = callbackExecutor((sql) => {
    if (/FROM machines/.test(sql) && /FOR UPDATE/.test(sql)) return [{ id: 5, process_id: 1, machine_code: '5', is_automatic: 1, max_workers_per_machine: 4, output_basis: 'MACHINE' }];
    if (/SELECT DISTINCT worker_id/.test(sql)) return [{ worker_id: 1, machine_code: '5' }, { worker_id: 2, machine_code: '5' }, { worker_id: 3, machine_code: '5' }, { worker_id: 4, machine_code: '5' }];
    return [];
  });
  const fifth = await validateMachineWorkerCapacityLocked({ executor: fifthExecutor, processCode: 'GC', processId: 1, machineLines: [{ machine_code: '5' }], workerId: 5, workDate: '2026-08-12', shift: 'A' });
  assert.equal(fifth.valid, false);
});

test('same worker repeated activity remains one distinct worker in capacity SQL', () => {
  const source = fs.readFileSync(path.join(root, 'services/factoryMachineRuleService.js'), 'utf8');
  assert.match(source, /SELECT DISTINCT worker_id/);
  assert.doesNotMatch(source, /COUNT\(\*\).*event/i);
});

test('worker report approval copies machine_event_id and cannot fabricate physical event', () => {
  const createModel = fs.readFileSync(path.join(root, 'models/productionTempCreateModel.js'), 'utf8');
  const approval = fs.readFileSync(path.join(root, 'models/productionTempApprovalModel.js'), 'utf8');
  assert.match(createModel, /report_id, machine_event_id, machine_id/);
  assert.match(createModel, /line\.machine_event_id \|\| null/);
  assert.match(approval, /assertApprovedEventForTempLine/);
  assert.doesNotMatch(createModel, /physical_counted_output\s*\/\s*(?:worker|4)/i);
});

test('dashboard machine metrics aggregate approved physical events, not worker credits', () => {
  const source = fs.readFileSync(path.join(root, 'controllers/dashboardController.js'), 'utf8');
  assert.match(source, /FROM machine_production_events e/);
  assert.match(source, /SUM\(e\.physical_counted_output\)/);
  assert.doesNotMatch(source.match(/SELECT COUNT\(DISTINCT e\.machine_id\)[\s\S]*?\),\n\s*db\.promise/)?.[0] || '', /SUM\(ml\.counted_output\)/);
});

test('Excel company payload carries physical events separately from worker reports', () => {
  const backend = fs.readFileSync(path.join(root, 'controllers/companyExcelDataController.js'), 'utf8');
  const loader = fs.readFileSync(path.join(root, 'services/bulkCompanyExcelDataService.js'), 'utf8');
  const desktop = fs.readFileSync(path.join(repo, 'desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
  assert.match(loader, /physicalMachineEvents/);
  assert.match(loader, /FROM machine_production_events e/);
  assert.match(backend, /processes: processData/);
  assert.match(desktop, /_KTC_MACHINE_EVENTS/);
  assert.match(desktop, /physical_counted_output/);
});

test('shared-machine scanner is read-only and never creates events automatically', () => {
  const scanner = fs.readFileSync(path.join(root, 'services/sharedMachineAccountingAuditService.js'), 'utf8');
  const cli = fs.readFileSync(path.join(root, 'scripts/auditSharedMachineAccounting.js'), 'utf8');
  for (const source of [scanner, cli]) {
    assert.doesNotMatch(source, /\b(?:UPDATE|DELETE|INSERT|ALTER)\b/i);
  }
  assert.match(scanner, /SHARED_MACHINE_EVENT_UNKNOWN/);
  assert.match(scanner, /SHARED_MACHINE_DUPLICATE_OUTPUT_RISK/);
  assert.match(scanner, /SHARED_MACHINE_CAPACITY_DOUBLE_COUNT/);
  assert.match(scanner, /SHARED_MACHINE_OVERLAP_AMBIGUOUS/);
  assert.match(scanner, /SHARED_MACHINE_ALLOCATION_UNKNOWN/);
});

test('split GC reports re-check the 12-hour cap under the worker lock only once per group', () => {
  const source = fs.readFileSync(path.join(root, 'services/productionTempSubmissionService.js'), 'utf8');
  assert.match(source, /data\._daily_hours_machine_lines = machineLines/);
  assert.match(source, /childData\._skip_daily_hours_enforcement = index > 0/);
  const guardSource = fs.readFileSync(path.join(root, 'models/productionTempCreateModel.js'), 'utf8');
  assert.match(guardSource, /SELECT id FROM workers WHERE id=\? FOR UPDATE/);
});

test('GC process code is resolved from the database when the client sends only process_id', () => {
  const source = fs.readFileSync(path.join(root, 'services/productionTempSubmissionService.js'), 'utf8');
  assert.match(source, /const resolvedProcessCode = String\(processRows\?\.\[0\]\?\.process_code/);
  assert.match(source, /if \(resolvedProcessCode\) \{\s*data\.process_code = resolvedProcessCode;/);
  assert.match(source, /const reportMachineLines = machineLines/);
  assert.match(source, /const splitMachines = shouldSplitMachineReports\(data, reportMachineLines\)/);
  assert.match(source, /const isMaiProcess = \(data\) => processCodeOf\(data\) === "MAI"/);
  assert.match(source, /processCodeOf\(data\) === "DO" && machineLines\.length !== 1/);
  assert.match(source, /machine_group_request_id/);
  assert.match(source, /line\.product_code/);
  assert.match(source, /:line:/);
});

test('repository introduces no equal-split allocation in F05 production files', () => {
  const files = [
    'services/machineProductionEventService.js',
    'services/factoryMachineRuleService.js',
    'models/productionTempCreateModel.js',
    'models/productionTempUpdateModel.js',
  ];
  for (const rel of files) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.doesNotMatch(source, /physical(?:Output|_output|_counted_output)\s*\/\s*(?:worker|workers|workerCount|4|N)/i);
    assert.doesNotMatch(source, /equalShare|splitEqually/i);
  }
});

test('company Excel passes GC machine mode into canonical accounting for legacy deduction fallback', () => {
  const loader = fs.readFileSync(path.join(root, 'services/bulkCompanyExcelDataService.js'), 'utf8');
  assert.match(loader, /buildGiaCongMachineAccounting\([\s\S]*?operation_mode:\s*report\.operation_mode/);
});

test('bulk company Excel indexes temp report IDs once for deduction and defect hydration', () => {
  const loader = fs.readFileSync(path.join(root, 'services/bulkCompanyExcelDataService.js'), 'utf8');
  assert.match(loader, /const reportIdBySourceTempId = new Map/);
  assert.match(loader, /reportIdBySourceTempId\.get\(Number\(row\.temp_report_id\)\)/);
  assert.doesNotMatch(loader, /reports\.find\(\(item\) => Number\(item\.source_temp_id\)/);
});

test('bulk company Excel preserves worker deductions separately from physical machine deductions', () => {
  const loader = fs.readFileSync(path.join(root, 'services/bulkCompanyExcelDataService.js'), 'utf8');
  assert.match(loader, /const deductions = tempDeductions\.length \? tempDeductions : persistedDeductions/);
  assert.match(loader, /machineDeductions: machineAccounting\?\.deductions \|\| \[\]/);
  assert.doesNotMatch(loader, /deductions = machineDeductions/);
  assert.doesNotMatch(loader, /machineLines,\s*deductions,\s*total_time/);
});

test('shared physical event is counted once when several Worker lines reference it', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 1, machine_event_id: 501, machine_time_hours: 2, deductions_json: JSON.stringify([{ deduction_type_id: 7, deduction_code: 'STOP', hours: 0.5 }]) },
      { id: 2, machine_event_id: 501, machine_time_hours: 3, deductions_json: JSON.stringify([{ deduction_type_id: 7, deduction_code: 'STOP', hours: 0.5 }]) }
    ]
  };
  const result = buildGiaCongMachineAccounting(report, new Map([[501, { id: 501, machine_time_hours: 6 }]]));
  assert.equal(result.source, 'MACHINE_EVENT');
  assert.equal(result.grossHours, 6, 'physical hours are counted once per event');
  assert.equal(result.deductionHours, 0.5, 'physical downtime is counted once per event');
  assert.equal(result.netHours, 5.5);
  assert.equal(result.deductions.length, 1);
  assert.equal(result.deductions[0].hours, 0.5);
});

test('different physical events are summed independently without merging Worker participation', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 11, machine_event_id: 601, machine_time_hours: 2, deductions_json: JSON.stringify([{ deduction_type_id: 7, deduction_code: 'STOP', hours: 0.25 }]) },
      { id: 12, machine_event_id: 602, machine_time_hours: 3, deductions_json: JSON.stringify([{ deduction_type_id: 8, deduction_code: 'CHANGE', hours: 0.75 }]) }
    ]
  };
  const result = buildGiaCongMachineAccounting(report, new Map([
    [601, { id: 601, machine_time_hours: 4 }],
    [602, { id: 602, machine_time_hours: 5 }]
  ]));
  assert.equal(result.source, 'MACHINE_EVENT');
  assert.equal(result.grossHours, 9);
  assert.equal(result.deductionHours, 1);
  assert.equal(result.netHours, 8);
  assert.deepEqual(result.deductions.map((item) => item.hours), [0.25, 0.75]);
});

test('missing one linked physical event reports partial source and never invents its hours', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 21, machine_event_id: 701, machine_time_hours: 2, excel_machine_time_hours: 8 },
      { id: 22, machine_event_id: 702, machine_time_hours: 3, excel_machine_time_hours: 9 }
    ]
  };
  const result = buildGiaCongMachineAccounting(report, new Map([
    [701, { id: 701, machine_time_hours: 4 }]
  ]));
  assert.equal(result.source, 'MACHINE_EVENT_PARTIAL');
  assert.equal(result.grossHours, 4, 'missing linked event is not replaced by Worker or Excel line hours');
  assert.equal(result.deductionHours, 0);
  assert.equal(result.netHours, 4);
});

test('unlinked legacy machine lines use line-level physical-hour fallback only', () => {
  const report = {
    operation_mode: 'MACHINE',
    machineLines: [
      { id: 31, machine_event_id: null, machine_time_hours: 2, excel_machine_time_hours: 4 },
      { id: 32, machine_event_id: null, machine_time_hours: 3, excel_machine_time_hours: 5 }
    ]
  };
  const result = buildGiaCongMachineAccounting(report, new Map());
  assert.equal(result.source, 'MACHINE_LINE');
  assert.equal(result.grossHours, 9, 'legacy line fallback uses excel_machine_time_hours where present');
  assert.equal(result.netHours, 9);
});

test('machine report with no machine lines is explicitly marked as missing', () => {
  const result = buildGiaCongMachineAccounting({ operation_mode: 'MACHINE', machineLines: [] }, new Map());
  assert.equal(result.source, 'MACHINE_DATA_MISSING');
  assert.equal(result.grossHours, 0);
  assert.equal(result.netHours, 0);
});


test('Mài creates one report per product line, even when several products use the same machine', () => {
  const source = fs.readFileSync(path.join(root, 'services/productionTempSubmissionService.js'), 'utf8');
  assert.match(source, /const shouldSplitMachineReports = \(data, machineLines\) =>[\s\S]*isGiaCongProcess\(data\) \|\| isMaiProcess\(data\)/);
  assert.match(source, /const reportMachineLines = machineLines/);
  assert.match(source, /DO_SINGLE_MACHINE_REQUIRED/);
  assert.match(source, /line\.product_code/);
  assert.match(source, /:line:/);
  assert.match(source, /machine_group_request_id/);
  assert.match(source, /const splitMachines = shouldSplitMachineReports\(data, reportMachineLines\)/);
  assert.doesNotMatch(source, /splitGcLinePayload/);
});

test('parallel-machine daily hours aggregate net hours by machine before taking the maximum', () => {
  const source = fs.readFileSync(path.join(root, 'services/productionTempSubmissionService.js'), 'utf8');
  const createModel = fs.readFileSync(path.join(root, 'models/productionTempCreateModel.js'), 'utf8');
  const updateModel = fs.readFileSync(path.join(root, 'models/productionTempUpdateModel.js'), 'utf8');
  for (const code of [source, createModel, updateModel]) {
    assert.match(code, /netHoursByMachine/);
    assert.match(code, /netHoursByMachine\.set\(machine, \(netHoursByMachine\.get\(machine\) \|\| 0\) \+ net\)/);
  }
});
