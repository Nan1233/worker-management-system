const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProductionReport, isImplicitGcNonProductWork } = require('../utils/reportValidation');

test('CVK report accepts zero standard and zero production output', () => {
  const result = validateProductionReport({
    process_id: 60006,
    process_code: 'CVK',
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'C',
    machine_no: '',
    product_name: '',
    total_time: 7.5,
    actual_time: 7.5,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    training_percent: 100,
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.normalized.standard_output, 0);
  assert.equal(result.normalized.actual_output, 0);
});

test('parent-process non-product work accepts zero standard while retaining its parent process id', () => {
  const payload = {
    process_id: 1,
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'A',
    machine_no: '',
    product_name: '',
    total_time: 4,
    actual_time: 4,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    training_percent: 100,
    extra_data: { non_product_work: true, work_type: 'CÔNG VIỆC KHÁC', parent_process_id: 1, process_code: 'GC' },
  };
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.normalized.process_id, 1);
  assert.equal(result.normalized.standard_output, 0);
});

test('normal production report still rejects zero standard', () => {
  const result = validateProductionReport({
    process_id: 1,
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'A',
    machine_no: 'M1',
    product_name: 'P1',
    total_time: 8,
    actual_time: 8,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    training_percent: 100,
  }, { skipActualOutputFormula: true });

  assert.equal(result.valid, false);
  assert.ok(result.errors.standard_output);
});

test('GC Xuất nhập work type accepts zero standard even when non_product_work flag is absent', () => {
  const payload = {
    process_id: 1,
    process_code: 'GC',
    work_type: 'Xuất nhập',
    work_date: new Date().toISOString().slice(0, 10),
    shift: 'A',
    machine_no: '',
    product_name: '',
    total_time: 4,
    actual_time: 4,
    deduction_time: 0,
    standard_output: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    defects: [],
    deductions: [],
    training_percent: 100,
  };
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.normalized.standard_output, 0);
});

test('GC non-product classifier recognizes only approved work types without a product or machine', () => {
  const good = { process_id: 1, work_type: 'Xuất nhập', product_name: '', machine_no: '' };
  assert.equal(isImplicitGcNonProductWork(good), true);
  assert.equal(isImplicitGcNonProductWork({ ...good, work_type: 'KTCD' }), true);
  assert.equal(isImplicitGcNonProductWork({ ...good, work_type: 'TAIPP' }), true);
  assert.equal(isImplicitGcNonProductWork({ ...good, work_type: 'Bảo trì' }), false);
  assert.equal(isImplicitGcNonProductWork({ ...good, product_name: 'P1' }), false);
  assert.equal(isImplicitGcNonProductWork({ ...good, machine_no: 'C13' }), false);
  assert.equal(isImplicitGcNonProductWork({ ...good, operation_mode: 'MACHINE' }), false);
  assert.equal(isImplicitGcNonProductWork({ ...good, machine_lines: [{}] }), false);
  assert.equal(isImplicitGcNonProductWork({ ...good, machines: [{}] }), false);
  assert.equal(isImplicitGcNonProductWork({ ...good, process_id: 7, process_code: 'GC' }), false,
    'untrusted process_code must not override canonical process id');
});

test('GC machine production cannot bypass standard/output validation by claiming Xuất nhập', () => {
  const payload = {
    process_id: 1, process_code: 'GC', work_type: 'Xuất nhập',
    work_date: new Date().toISOString().slice(0, 10), shift: 'A',
    machine_no: 'C13', product_name: 'PART-1', operation_mode: 'MACHINE',
    total_time: 4, actual_time: 4, deduction_time: 0,
    standard_output: 0, actual_output: 0, tt_ok: 0, tt_ng: 0,
    defects: [], deductions: [], training_percent: 100
  };
  assert.equal(isImplicitGcNonProductWork(payload), false);
  const result = validateProductionReport(payload, { skipActualOutputFormula: true });
  assert.equal(result.valid, false);
  assert.ok(result.errors.tt_ok, JSON.stringify(result.errors));
});

test('worker submission shares the validated non-product classifier with master-data lookup', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '../controllers/productionTempWorkerController.js'), 'utf8');
  assert.match(source, /isImplicitGcNonProductWork\(req\.body\)/);
  assert.match(source, /nonProductWork: isNonProductWorkWithinProcess/);
  assert.match(source, /if \(implicitGcNonProductWork\) extraDataInput\.non_product_work = true/);
});
