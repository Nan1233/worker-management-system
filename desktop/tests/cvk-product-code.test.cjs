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
      dataSource: 'tidb.production_reports.approved',
      processes: {
        [processCode]: {
          processName: processCode,
          reports: [{
            id: 1,
            dataSource: 'production_reports',
            isApprovedDatabaseRecord: true,
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

  assert.equal(result.mode, 'PROCESS_WORKBOOKS');
  assert.equal(result.processes.length, 10, 'must generate one workbook for each of the ten processes');
  assert.equal(result.expectedFileCount, 11, 'ten process workbooks plus the monthly summary');
  assert.ok(result.summary?.buffer, 'monthly summary workbook should also be generated');
  assert.deepEqual(result.processes.map((item) => item.processCode), PROCESS_CODES);

  const processWorkbook = result.processes.find((item) => item.processCode === processCode);
  assert.ok(processWorkbook, `a separate ${processCode} workbook should be generated`);
  assert.equal(processWorkbook.reportCount, 1);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(processWorkbook.buffer));
  const sheet = workbook.worksheets.find((item) => item.state !== 'hidden') || workbook.worksheets[0];
  assert.ok(sheet, 'exported workbook should contain a visible worksheet');

  const cols = processWorkbook.columnContract?.cols || {};
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
  assert.ok(matchedRow, 'report row should appear only in its own process workbook after ExcelJS round-trip');
  return {
    result,
    value: String(matchedRow.getCell(productColumn).value ?? '').trim()
  };
}

test('export contract creates ten distinct process workbooks plus monthly summary', async () => {
  const result = await buildWorkerSplit({
    appPath,
    date: exportDate,
    payload: { dataSource: 'tidb.production_reports.approved', processes: {} }
  });
  assert.equal(result.mode, 'PROCESS_WORKBOOKS');
  assert.deepEqual(result.processes.map((item) => item.processCode), PROCESS_CODES);
  assert.equal(new Set(result.processes.map((item => item.fileName))).size, 10);
  assert.equal(result.expectedFileCount, 11);
  assert.ok(result.summary?.buffer);
});

test('export rejects payloads that are not approved TiDB production reports', async () => {
  await assert.rejects(
    buildWorkerSplit({ appPath, date: exportDate, payload: { processes: {} } }),
    /chỉ được xuất từ production_reports đã duyệt trong TiDB/
  );
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
