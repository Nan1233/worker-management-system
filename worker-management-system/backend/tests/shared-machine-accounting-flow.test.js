const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { calculateEventPhysical, isSharedEventManaged, assertApprovedEventForTempLine } = require('../services/machineProductionEventService');
const { validateMachineWorkerCapacityLocked } = require('../services/factoryMachineRuleService');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..');

function callbackExecutor(handler) {
  return { query(sql, params, cb) { try { cb(null, handler(sql, params)); } catch (e) { cb(e); } } };
}

test('physical event output is independent from worker credits and uses KQD registry', () => {
  const result = calculateEventPhysical({
    physicalOkQuantity: 990,
    defects: [
      { defect_code: 'BAVIA', quantity: 6 },
      { defect_code: 'KQD', quantity: 4 },
    ],
    excludeKqdFromTt: 1,
    machineTimeHours: 1,
    standardOutput: 1000,
  });
  assert.equal(result.physicalNgQuantity, 10);
  assert.equal(result.physicalTotalOutput, 1000);
  assert.equal(result.physicalCountedOutput, 996);
  assert.equal(result.maximumOutput, 1000);
  // Worker credits are intentionally not an input to physical calculation.
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'workerCredit'), false);
});

test('unconfigured KQD_TEST remains a normal physical defect', () => {
  const result = calculateEventPhysical({
    physicalOkQuantity: 990,
    defects: [{ defect_code: 'KQD_TEST', quantity: 10 }],
    excludeKqdFromTt: 1,
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
    if (/SELECT DISTINCT worker_id/.test(sql)) return [{ worker_id: 1 }, { worker_id: 2 }, { worker_id: 3 }];
    return [];
  });
  const fourth = await validateMachineWorkerCapacityLocked({ executor, processCode: 'GC', processId: 1, machineLines: [{ machine_code: '5' }], workerId: 4, workDate: '2026-08-12', shift: 'A' });
  assert.equal(fourth.valid, true);
  assert.match(statements[0], /ORDER BY id FOR UPDATE/);

  const fifthExecutor = callbackExecutor((sql) => {
    if (/FROM machines/.test(sql) && /FOR UPDATE/.test(sql)) return [{ id: 5, process_id: 1, machine_code: '5', is_automatic: 1, max_workers_per_machine: 4, output_basis: 'MACHINE' }];
    if (/SELECT DISTINCT worker_id/.test(sql)) return [{ worker_id: 1 }, { worker_id: 2 }, { worker_id: 3 }, { worker_id: 4 }];
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
  const loader = fs.readFileSync(path.join(root, 'services/processExcelExportService.js'), 'utf8');
  const desktop = fs.readFileSync(path.join(repo, 'desktop/electron/monthlyWorkbookLocal.cjs'), 'utf8');
  assert.match(loader, /physicalMachineEvents/);
  assert.match(loader, /FROM machine_production_events e/);
  assert.match(backend, /physicalMachineEvents: reports\.physicalMachineEvents/);
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
