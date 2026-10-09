const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ExcelJS = require('exceljs');
const master = require('../config/ktcTemplateMasterData.js');
const { writeGcWorkerSheet } = require('../services/gcWorkerReportExcel');
const { buildGcWorkerRows } = require('../services/gcWorkerReportRows');

const TEMPLATE = path.join(__dirname, '../templates/04_CAT_LONG_template.xlsx');
const gc = (master.KTC_TEMPLATE_MASTER_DATA || master.default || master);
const processes = gc.processes || gc;
const deductionTypes = processes.GC.deductions.map((name, i) => ({ id: 100 + i, deduction_name: name }));
const defectTypes = [
  { id: 1, defect_name: 'Cao su không đứt' }, { id: 2, defect_name: 'Cắt lẹm' }, { id: 3, defect_name: 'Cắt phạm' },
  { id: 4, defect_name: 'Cao su vỡ' }, { id: 5, defect_name: 'Cao su xoay' }
];
const dedId = (name) => deductionTypes.find((t) => t.deduction_name === name).id;

const report2Machines = {
  id: 10, work_date: '2026-09-03', worker_code: '4310', full_name: 'Lò Văn Thành', shift: 'A', training_percent: 100,
  operation_mode: 'MACHINE', total_time: 12, actual_time: 10, deduction_time: 2,
  // Report-level aggregates must never be copied onto machine rows.
  deductions: [{ deduction_type_id: dedId('Nghỉ giải lao'), deduction_name: 'Nghỉ giải lao', hours: 99 }],
  defects: [{ defect_type_id: 1, defect_name: 'Cao su không đứt', quantity: 999 }],
  machineLines: [
    { id: 1, sort_order: 1, machine_code: '5', product_code: '5770', machine_time_hours: 6, standard_output: 600,
      deductions_json: JSON.stringify([{ deduction_type_id: dedId('Nghỉ giải lao'), deduction_name: 'Nghỉ giải lao', hours: 1 }, { deduction_type_id: dedId('5s'), deduction_name: '5s', hours: 0.5 }]),
      ok_quantity: 3000, ng_quantity: 100,
      defects: [{ defect_type_id: 1, defect_name: 'Cao su không đứt', quantity: 60 }, { defect_type_id: 3, defect_name: 'Cắt phạm', quantity: 40 }] },
    { id: 2, sort_order: 2, machine_code: 'c7', product_code: '9116', machine_time_hours: 6, standard_output: 300,
      deductions_json: JSON.stringify([{ deduction_type_id: dedId('Chờ hàng'), deduction_name: 'Chờ hàng', hours: 2 }]),
      ok_quantity: 1000, ng_quantity: 20, defects: [{ defect_type_id: 2, defect_name: 'Cắt lẹm', quantity: 20 }] }
  ]
};
const manual = {
  id: 11, work_date: '2026-09-03', worker_code: '947', full_name: 'Sùng Mí Say', shift: 'C', training_percent: 100,
  operation_mode: 'MANUAL', actual_time: 1.17, total_time: 1.17, deduction_time: 0, standard_output: 840,
  product_name: 'ltx', tt_ok: 960, tt_ng: 0, deductions: [], defects: [], machineLines: []
};
const nextDay = { ...manual, id: 12, work_date: '2026-09-04', worker_code: '4017', tt_ok: 240, tt_ng: 10, defects: [{ defect_type_id: 4, defect_name: 'Cao su vỡ', quantity: 10 }] };

async function render(reports) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE);
  const sheet = workbook.getWorksheet('Báo cáo công nhân');
  const result = writeGcWorkerSheet(sheet, reports, { deductionTypes, defectTypes });
  return { sheet, result, workbook };
}
const v = (sheet, ref) => { const x = sheet.getCell(ref).value; return x && typeof x === 'object' && 'formula' in x ? x : x; };

test('clean 04 template: 48 columns A:AV, AA formula, no September data', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE);
  assert.equal(workbook.worksheets.length, 1);
  const sheet = workbook.getWorksheet('Báo cáo công nhân');
  assert.equal(sheet.actualColumnCount, 48);
  assert.equal(sheet.getCell('A3').value, 'STT');
  assert.equal(sheet.getCell('AV3').value, 'thiếu cao su');
  assert.equal(sheet.getCell('AA5').value.formula, 'IFERROR(Z5/Y5,0)');
  assert.equal(sheet.getCell('A4').value, null);
  assert.equal(sheet.rowCount, 5);
});

test('report with 2 machine lines produces exactly 2 rows with per-line data', async () => {
  const { sheet, result } = await render([report2Machines]);
  assert.equal(result.rowCount, 2);
  assert.equal(sheet.actualRowCount, 4); // header, date row, 2 machine rows
  assert.equal(sheet.getRow(7).actualCellCount, 0, "no third row");
  // rows: 4 date, 5 machine 5, 6 machine c7
  assert.ok(sheet.getCell('A4').value instanceof Date);
  assert.equal(sheet.getCell('A5').value, 1);
  assert.equal(sheet.getCell('A6').value, 2);
  assert.equal(sheet.getCell('D5').value, '5');
  assert.equal(sheet.getCell('D6').value, 'c7');
  assert.equal(sheet.getCell('E5').value, 'A');
  assert.equal(sheet.getCell('X5').value, '5770');
  assert.equal(sheet.getCell('X6').value, '9116');
  // F = machine_time - deductions, G = sum of deductions
  assert.equal(sheet.getCell('F5').value, 4.5);
  assert.equal(sheet.getCell('G5').value, 1.5);
  assert.equal(sheet.getCell('F6').value, 4);
  assert.equal(sheet.getCell('G6').value, 2);
});

test('deductions H:W and defects AD:AV are per line and not duplicated from the report', async () => {
  const { sheet } = await render([report2Machines]);
  const head = (c) => sheet.getCell(`${c}3`).value;
  const col = (label) => { for (let c = 1; c <= 48; c += 1) if (String(sheet.getRow(3).getCell(c).value).toLowerCase().replace(/\s+/g, ' ') === label.toLowerCase()) return c; return null; };
  const at = (row, label) => sheet.getRow(row).getCell(col(label)).value;
  assert.equal(at(5, 'Nghỉ giải lao'), 1);
  assert.equal(at(5, '5s'), 0.5);
  assert.equal(at(5, 'Chờ hàng'), null);
  assert.equal(at(6, 'Chờ hàng'), 2);
  assert.equal(at(6, 'Nghỉ giải lao'), null);
  assert.equal(at(5, 'Cắt không đứt'), 60);
  assert.equal(at(6, 'Cắt không đứt'), null);
  assert.equal(at(6, 'cắt lẹm'), 20);
  assert.equal(at(5, 'cắt lẹm'), null);
  // Σ H:W == G and Σ AD:AV (mapped) == AC
  for (const r of [5, 6]) {
    let d = 0; let n = 0;
    for (let c = 8; c <= 23; c += 1) d += Number(sheet.getRow(r).getCell(c).value || 0);
    for (let c = 30; c <= 48; c += 1) n += Number(sheet.getRow(r).getCell(c).value || 0);
    if (r === 5) { assert.equal(d, 1.5); assert.equal(n, 60); } // 40 "Cắt phạm" is unmapped
    if (r === 6) { assert.equal(d, 2); assert.equal(n, 20); }
  }
  assert.ok(head('H'));
});

test('Z = OK + NG, AB = OK, AC = NG, AA keeps its formula, Y uses worked hours', async () => {
  const { sheet } = await render([report2Machines]);
  assert.equal(sheet.getCell('AB5').value, 3000);
  assert.equal(sheet.getCell('AC5').value, 100);
  assert.equal(sheet.getCell('Z5').value, 3100);
  assert.equal(sheet.getCell('Y5').value, 2700); // 600/h * 4.5h
  assert.equal(sheet.getCell('AA5').value.formula, 'IFERROR(Z5/Y5,0)');
  assert.equal(sheet.getCell('AA6').value.formula, 'IFERROR(Z6/Y6,0)');
  assert.equal(sheet.getCell('Z6').value, 1020);
  assert.equal(sheet.getCell('Y6').value, 1200); // 300/h * 4h
});

test('unmapped defects stay unmapped and are listed, not folded into another column', async () => {
  const { result } = await render([report2Machines]);
  assert.deepEqual(result.unmapped.map((u) => [u.kind, u.name, u.value, u.machine]), [['defect', 'Cắt phạm', 40, '5']]);
  assert.deepEqual(result.warnings, [], 'defect detail equals ng_quantity on both lines');
  const lone = { ...report2Machines, machineLines: [{ ...report2Machines.machineLines[0], ng_quantity: 150 }] };
  const { result: r2 } = await render([lone]);
  assert.ok(r2.warnings.some((w) => w.code === 'DEFECT_TOTAL_DIFFERS_FROM_NG' && w.machine === '5'));
});

test('manual rows follow the 04 sample and date rows / STT reset per day', async () => {
  const { sheet, result } = await render([report2Machines, manual, nextDay]);
  assert.equal(result.dayCount, 2);
  // 4 date, 5-6 machines, 7 manual, 8 date, 9 manual
  assert.ok(sheet.getCell('A4').value instanceof Date);
  assert.equal(sheet.getCell('A7').value, 3);
  assert.equal(sheet.getCell('D7').value, null);
  assert.equal(sheet.getCell('F7').value, 1.17);
  assert.equal(sheet.getCell('G7').value, 0);
  assert.equal(sheet.getCell('X7').value, 'ltx');
  assert.equal(sheet.getCell('Z7').value, 960);
  assert.ok(sheet.getCell('A8').value instanceof Date);
  assert.equal(sheet.getCell('A8').value.toISOString().slice(0, 10), '2026-09-04');
  assert.equal(sheet.getCell('A9').value, 1);
  assert.equal(sheet.getCell('AC9').value, 10);
  assert.equal(sheet.getCell('AA9').value.formula, 'IFERROR(Z9/Y9,0)');
  assert.equal(sheet.getCell('E7').value, 'C');
});

test('date row keeps the template style and the file round-trips with formula intact', async () => {
  const { sheet, workbook } = await render([report2Machines, manual]);
  assert.equal(sheet.getCell('A4').fill.fgColor.argb, 'FFEA8FD3');
  assert.equal(sheet.getCell('A4').numFmt, 'mmm-dd');
  assert.equal(sheet.getRow(3).height, 83.1);
  assert.equal(sheet.views[0].ySplit, 3);
  const buffer = await workbook.xlsx.writeBuffer();
  const again = new ExcelJS.Workbook();
  await again.xlsx.load(buffer);
  const s2 = again.getWorksheet('Báo cáo công nhân');
  assert.equal(s2.getCell('AA5').value.formula, 'IFERROR(Z5/Y5,0)');
  assert.equal(s2.actualColumnCount, 48);
  assert.equal(s2.conditionalFormattings.length, 1);
  assert.equal(s2.conditionalFormattings[0].ref, 'AA5:AA7');
});

test('row builder: machine rows ignore report totals; legacy reports without lines give one row', () => {
  const rows = buildGcWorkerRows(report2Machines);
  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((s, r) => s + r.deductionHours, 0), 3.5);
  assert.equal(rows.reduce((s, r) => s + r.ng, 0), 120);
  assert.equal(buildGcWorkerRows(manual).length, 1);
});

test('GC Excel row prefers physical export machine time over worker participation time', () => {
  const rows = buildGcWorkerRows({
    ...report2Machines,
    machineLines: [{
      ...report2Machines.machineLines[0],
      machine_time_hours: 3,
      excel_machine_time_hours: 5,
      deduction_time_hours: 0.5,
      deductions_json: JSON.stringify([{ deduction_type_id: dedId('5s'), deduction_name: '5s', hours: 0.5 }])
    }]
  });
  assert.equal(rows[0].totalHours, 5);
  assert.equal(rows[0].deductionHours, 0.5);
  assert.equal(rows[0].workedHours, 4.5);
});

test('GC machine report with no machine detail does not export worker hours as machine hours', () => {
  const rows = buildGcWorkerRows({
    ...report2Machines,
    machine_no: 'GC01',
    total_time: 8,
    actual_time: 7,
    deduction_time: 1,
    machineLines: []
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'MACHINE_DATA_MISSING');
  assert.equal(rows[0].totalHours, 0);
  assert.equal(rows[0].workedHours, 0);
  assert.ok(rows[0].warnings.includes('MACHINE_TIME_UNAVAILABLE_NO_MACHINE_LINES'));
});
