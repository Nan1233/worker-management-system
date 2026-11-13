'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { buildProcessWorkbookLocal, _private } = require('../electron/monthlyWorkbookLocal.cjs');

const physicalEvent = {
  id: 9026,
  process_id: 1,
  machine_id: 50,
  machine_code: 'C2556-2',
  product_code: 'QC5-1657',
  work_date: '2026-10-30',
  shift: 'A',
  status: 'approved',
  machine_time_hours: 8,
  physical_ok_quantity: 140,
  physical_ng_quantity: 5,
  physical_counted_output: 145,
  physical_total_output: 145,
  standard_output: 100,
  maximum_output: 800
};

function workerReport(id, code, hours, ok) {
  return {
    id,
    dataSource: 'production_reports',
    isApprovedDatabaseRecord: true,
    status: 'approved',
    process_code: 'GC',
    work_date: '2026-10-30',
    entry_date: '2026-10-30',
    created_at: '2026-10-30 08:00:00',
    updated_at: '2026-10-30 09:00:00',
    worker_code: code,
    full_name: 'Worker test ' + code,
    shift: 'A',
    operation_type: 'CUT',
    operation_mode: 'MACHINE',
    machine_no: 'C2556-2',
    product_name: 'QC5-1657',
    total_time: 0,
    actual_time: 0,
    deduction_time: 0,
    actual_output: 0,
    tt_ok: 0,
    tt_ng: 0,
    training_percent_snapshot: 100,
    standard_output: 0,
    deductions: [],
    defects: [],
    machineLines: [{
      id: id * 10,
      machine_event_id: physicalEvent.id,
      machine_id: physicalEvent.machine_id,
      machine_code: physicalEvent.machine_code,
      product_code: physicalEvent.product_code,
      machine_time_hours: hours,
      excel_machine_time_hours: physicalEvent.machine_time_hours,
      deduction_time_hours: 0.5,
      standard_output: 100,
      ok_quantity: ok,
      ng_quantity: 0,
      deductions_json: JSON.stringify([{
        deduction_type_id: 7,
        deduction_code: 'STOP',
        deduction_name: 'Dừng máy',
        hours: 0.5
      }]),
      defects: []
    }],
    eventLines: [physicalEvent]
  };
}

const reports = [
  workerReport(1101, 'W001', 3, 60),
  workerReport(1102, 'W002', 4, 80)
];

const payload = {
  dataSource: 'tidb.production_reports.approved',
  yearMonth: '2026-10',
  processes: {
    GC: {
      processId: 1,
      processCode: 'GC',
      processName: 'Gia công',
      reports,
      physicalMachineEvents: [physicalEvent, { ...physicalEvent }],
      deductionTypes: [{
        id: 7, code: 'STOP', deduction_code: 'STOP',
        deduction_name: 'Dừng máy', name: 'Dừng máy'
      }],
      defectTypes: []
    }
  }
};

test('actual GC Desktop XLSX round trip preserves worker participation and one shared physical event', async () => {
  const built = await buildProcessWorkbookLocal({
    date: '2026-10-30', payload, processCode: 'GC'
  });
  assert.equal(built.fileName, '04_CAT_LONG_10-2026.xlsx');
  assert.ok(Buffer.isBuffer(built.buffer));
  assert.ok(built.buffer.byteLength > 1000);

  // Parse the real ZIP/XLSX bytes, not a mocked worksheet or source-regex.
  const opened = new ExcelJS.Workbook();
  await opened.xlsx.load(built.buffer);

  const visible = opened.worksheets
    .filter((sheet) => sheet.state !== 'veryHidden' && sheet.state !== 'hidden')
    .map((sheet) => sheet.name);
  // The approved Workbook1 template names its visible GC sheet 'Gia công'.
  // Preserve that template name instead of renaming the exported worksheet.
  assert.deepEqual(visible, ['Gia công', 'TAY MÁY CẮT LỒNG']);
  const sheet = opened.getWorksheet('Gia công');
  assert.equal(sheet.views[0].xSplit, 4);
  assert.equal(sheet.views[0].ySplit, 5);

  // Derive positions from header text rather than relying on column order.
  const header = new Map();
  sheet.getRow(5).eachCell((cell, column) => header.set(String(cell.value), column));
  for (const key of ['Mã NV', 'Tổng thời gian', 'Thời gian thực tế', 'Tổng thời gian trừ', 'OK', 'Tổng NG', 'ID']) {
    assert.ok(header.has(key), 'missing XLSX header ' + key);
  }

  const workerRows = new Map();
  for (let row = 6; row <= sheet.rowCount; row += 1) {
    const code = String(sheet.getCell(row, header.get('Mã NV')).value || '');
    if (code === 'W001' || code === 'W002') workerRows.set(code, row);
  }
  assert.equal(workerRows.size, 2, 'two separate worker credit rows must remain');

  for (const report of reports) {
    const row = workerRows.get(report.worker_code);
    const snapshot = _private.reportSnapshot(report);
    assert.equal(sheet.getCell(row, header.get('ID')).value, report.id);
    assert.equal(sheet.getCell(row, header.get('Tổng thời gian')).value, snapshot.workingTime);
    assert.equal(sheet.getCell(row, header.get('Thời gian thực tế')).value, snapshot.actualTime);
    assert.equal(sheet.getCell(row, header.get('Tổng thời gian trừ')).value, snapshot.deductionTime);
    assert.equal(sheet.getCell(row, header.get('OK')).value, snapshot.ok);
    assert.equal(sheet.getCell(row, header.get('Tổng NG')).value, snapshot.ng);
    assert.notEqual(snapshot.workingTime, 8, 'worker participation must not inherit shared machine hours');
  }
  assert.equal(
    reports.reduce((sum, report) => sum + _private.reportSnapshot(report).workingTime, 0), 7
  );

  const metadata = opened.getWorksheet('_KTC_MACHINE_EVENTS');
  assert.ok(metadata);
  assert.equal(metadata.state, 'veryHidden');
  assert.equal(metadata.rowCount, 2, 'same physical event must be exported only once');
  assert.equal(metadata.getCell('A2').value, physicalEvent.id);
  assert.equal(metadata.getCell('K2').value, 8);
  assert.equal(metadata.getCell('G2').value, 140);
  assert.equal(metadata.getCell('O2').value, 0.5, 'shared machine deduction recorded once');
  assert.equal(metadata.getCell('Q2').value, 'RECORDED_ONCE');
  assert.equal(
    [...Array(metadata.rowCount - 1)].reduce(
      (sum, _, index) => sum + Number(metadata.getCell(index + 2, 11).value || 0), 0
    ), 8, 'physical machine hours are not doubled by two workers'
  );

  const sync = opened.getWorksheet('_KTC_SYNC');
  assert.ok(sync);
  assert.equal(sync.state, 'veryHidden');
  const syncMeta = JSON.parse(String(sync.getCell('A1').value));
  assert.equal(syncMeta.processCode, 'GC');
  assert.equal(syncMeta.yearMonth, '2026-10');
  const syncIds = [];
  for (let r = 3; r <= sync.rowCount; r += 1) syncIds.push(Number(sync.getCell(r, 1).value));
  assert.deepEqual(syncIds.sort((a, b) => a - b), [1101, 1102]);
});
