'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { buildWorkerSplit, PROCESS_CODES } = require('../electron/excelExportContractPatch.v6.cjs');

const appPath = path.resolve(__dirname, '..', '..');
const exportDate = '2026-10-01';

async function exportAndRead(processCode, report) {
  const result = await buildWorkerSplit({
    appPath,
    date: exportDate,
    payload: {
      processes: {
        [processCode]: {
          processName: processCode,
          reports: [{
            id: 1,
            process_code: processCode,
            worker_code: `TEST-${processCode}`,
            full_name: 'Regression Test',
            work_date: exportDate,
            shift: 'A',
            product_name: null,
            product_code: null,
            standard_output: 0,
            actual_time: 1,
            total_time: 1,
            actual_output: 0,
            tt_ok: 0,
            tt_ng: 0,
            deductions: [],
            defects: [],
            ...report
          }]
        }
      }
    }
  });

  assert.equal(result.mode, 'WORKER_REPORT_SINGLE_FILE');
  assert.equal(result.processes.length, 1, 'v6 must produce one workbook, not a duplicate per process');
  assert.equal(result.expectedFileCount, 1);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(result.processes[0].buffer));
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  assert.ok(sheet, 'exported workbook should contain a visible worksheet');

  const cols = result.processes[0].columnContract?.cols || {};
  const workerCodeColumn = Number(cols.workerCode);
  const productColumn = Number(cols.product);
  assert.ok(workerCodeColumn > 0, 'worker code column should be mapped');
  assert.ok(productColumn > 0, 'MSP/product column should be mapped');

  let matchedRow = null;
  sheet.eachRow((row) => {
    if (String(row.getCell(workerCodeColumn).value ?? '').trim() === `TEST-${processCode}`) {
      matchedRow = row;
    }
  });
  assert.ok(matchedRow, 'exported report row should be present after ExcelJS write/read round-trip');
  return {
    result,
    value: String(matchedRow.getCell(productColumn).value ?? '').trim()
  };
}


test('Mài with multiple physical machine lines exports one row per machine', async () => {
  const result = await buildWorkerSplit({
    appPath,
    date: exportDate,
    payload: {
      processes: {
        MAI: {
          processName: 'MAI',
          reports: [{
            id: 909,
            process_code: 'MAI',
            operation_mode: 'MACHINE',
            worker_code: 'TEST-MAI-MULTI',
            full_name: 'Machine Row Regression',
            work_date: exportDate,
            shift: 'A',
            standard_output: 0,
            actual_time: 6,
            total_time: 6,
            actual_output: 90,
            tt_ok: 90,
            tt_ng: 0,
            deductions: [],
            defects: [],
            machineLines: [
              { id: 901, machine_code: 'MAI-01', machine_time_hours: 2, actual_output: 30, tt_ok: 30 },
              { id: 902, machine_code: 'MAI-02', machine_time_hours: 4, actual_output: 60, tt_ok: 60 }
            ]
          }]
        }
      }
    }
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(result.processes[0].buffer));
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  const cols = result.processes[0].columnContract.cols;
  const rows = [];
  sheet.eachRow((row) => {
    if (String(row.getCell(cols.workerCode).value ?? '').trim() === 'TEST-MAI-MULTI') rows.push(row);
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => String(row.getCell(cols.machine).value ?? '').trim()).sort(), ['MAI-01', 'MAI-02']);
  assert.deepEqual(rows.map((row) => Number(row.getCell(cols.output).value || 0)).sort((a,b)=>a-b), [30, 60]);
});

test('v6 includes CVK in its active process list', () => {
  assert.ok(PROCESS_CODES.includes('CVK'));
});

test('CVK exports extra_data.work_type into MSP after ExcelJS buffer round-trip', async () => {
  const { value } = await exportAndRead('CVK', {
    extra_data: { work_type: 'KTCD', process_code: 'CVK' }
  });
  assert.equal(value, 'KTCD');
});

test('CVK with no work_type leaves MSP blank instead of inventing a product code', async () => {
  const { value } = await exportAndRead('CVK', {
    extra_data: { process_code: 'CVK' }
  });
  assert.equal(value, '');
});

test('non-CVK product mapping remains unchanged', async () => {
  const { value } = await exportAndRead('CAN', {
    product_code: 'SP-001',
    product_name: null,
    extra_data: {}
  });
  assert.equal(value, 'SP-001');
});

test('CVK work_type supports XUATNHAP and TAIPP without treating them as product codes', async () => {
  for (const code of ['XUATNHAP', 'TAIPP']) {
    const { value } = await exportAndRead('CVK', {
      extra_data: JSON.stringify({ work_type: code, process_code: 'CVK' })
    });
    assert.equal(value, code);
  }
});
