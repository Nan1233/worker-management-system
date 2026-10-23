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

test('legacy GC non-product work maps TAIPP to TPP with object extra_data', async () => {
  const { value } = await exportAndRead('GC', {
    process_code: 'GC',
    extra_data: { non_product_work: true, process_code: 'GC', work_type: 'TAIPP' }
  });
  assert.equal(value, 'TPP');
});

test('legacy GC non-product work maps XUATNHAP to XN with JSON-string extra_data', async () => {
  const { value } = await exportAndRead('GC', {
    process_code: 'GC',
    extra_data: JSON.stringify({ non_product_work: true, process_code: 'GC', work_type: 'XUATNHAP' })
  });
  assert.equal(value, 'XN');
});

test('legacy GC non-product work preserves KTCD', async () => {
  const { value } = await exportAndRead('GC', {
    process_code: 'GC',
    extra_data: { non_product_work: true, process_code: 'GC', work_type: 'KTCD' }
  });
  assert.equal(value, 'KTCD');
});

test('non-CVK product mapping remains unchanged', async () => {
  const { value } = await exportAndRead('CAN', {
    product_code: 'SP-001',
    product_name: null,
    extra_data: {}
  });
  assert.equal(value, 'SP-001');
});
