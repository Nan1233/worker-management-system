'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const naming = require('../electron/monthlyWorkbookNaming.cjs');

const prefixes = {
  CAN: '01_CAN', EP: '02_EP', XLBV: '03_XU_LY_BAVIA',
  GC: '04_CAT_LONG', MAI: '05_MAI', DO: '06_DO',
  K1: '07_KIEM_1', K2: '08_KIEM_2', SX3: '09_SAN_XUAT_3',
  CVK: '10_CONG_VIEC_KHAC',
};

test('all ten process Excel filenames keep their original prefixes and month-year suffix', () => {
  assert.deepEqual({ ...naming.PROCESS_FILE_PREFIXES }, prefixes);
  for (const [code, prefix] of Object.entries(prefixes)) {
    assert.equal(
      naming.processWorkbookFileName(code, '2026-11-19', { yearMonth: '2026-11' }),
      prefix + '_11-2026.xlsx',
    );
  }
});

test('monthly summary filename is unchanged', () => {
  assert.equal(naming.summaryWorkbookFileName('2026-11-19', { yearMonth: '2026-11' }),
    '00_TONG_HOP_SAN_XUAT_11-2026.xlsx');
});

test('payload yearMonth takes precedence, with date fallback', () => {
  assert.equal(naming.processWorkbookFileName('GC', '2026-03-17', { yearMonth: '2025-12' }),
    '04_CAT_LONG_12-2025.xlsx');
  assert.equal(naming.processWorkbookFileName('MAI', '2026-03-17', {}),
    '05_MAI_03-2026.xlsx');
});

test('invalid month source and unknown process use the original error messages', () => {
  assert.throws(() => naming.summaryWorkbookFileName('invalid', {}),
    /Tháng xuất Excel không hợp lệ/);
  assert.throws(() => naming.processWorkbookFileName('UNKNOWN', '2026-11-19', {}),
    /Công đoạn không hỗ trợ xuất file riêng/);
});

test('monthly workbook renderer reexports naming API and retains sync/template contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '../electron/monthlyWorkbookLocal.cjs'), 'utf8');
  assert.match(source, /require\('\.\/monthlyWorkbookNaming\.cjs'\)/);
  assert.match(source, /PROCESS_FILE_PREFIXES,/);
  assert.match(source, /processWorkbookFileName,/);
  assert.match(source, /summaryWorkbookFileName,/);
  assert.match(source, /EXCEL_SYNC_CONTRACT_VERSION/);
  assert.match(source, /addExcelDbSyncMetadata/);
  assert.match(source, /renderOriginalProcessTemplate/);
  assert.match(source, /_KTC_SYNC/);
});
