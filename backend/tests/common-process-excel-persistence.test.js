'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveCommonProcessMonthlyWorkbook } = require('../services/commonProcessExcelPersistence');

const target = { folder: '/exports', filePath: '/exports/2026-11.xlsx', metadataPath: '/exports/2026-11.json', fileName: '2026-11.xlsx' };

test('Excel persistence writes temp workbook, renames and writes metadata', async () => {
  const calls = [];
  const fs = {
    async mkdir(folder, options) { calls.push(['mkdir', folder, options.recursive]); },
    async rename(from, to) { calls.push(['rename', from, to]); },
    async writeFile(file, data) { calls.push(['metadata', file, JSON.parse(data)]); },
    async unlink() { throw Error('unexpected unlink'); }
  };
  const workbook = { xlsx: { async writeFile(file) { calls.push(['workbook', file]); } } };
  const result = await saveCommonProcessMonthlyWorkbook(workbook, '2026-11', '/templates/common.xlsx', 4,
    { fs, getMonthlyTarget: () => target });
  assert.equal(result.archivePath, target.filePath);
  assert.equal(result.reportCount, 4);
  assert.equal(result.templateFile, 'common.xlsx');
  assert.deepEqual(calls.map(x => x[0]), ['mkdir', 'workbook', 'rename', 'metadata']);
  assert.equal(calls[1][1], calls[2][1]);
  assert.equal(calls[2][2], target.filePath);
  assert.equal(calls[3][2].layout, 'common-process-daily-blocks');
});

test('Excel persistence removes temporary file when workbook write fails', async () => {
  const calls = [];
  const fs = {
    async mkdir() {},
    async rename() { throw Error('rename must not run'); },
    async writeFile() { throw Error('metadata must not run'); },
    async unlink(file) { calls.push(file); }
  };
  const workbook = { xlsx: { async writeFile() { throw Error('disk full'); } } };
  await assert.rejects(saveCommonProcessMonthlyWorkbook(workbook, '2026-11', '/templates/common.xlsx', 4,
    { fs, getMonthlyTarget: () => target }), /disk full/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('.tmp'));
});


test('Excel persistence distinguishes metadata failure after workbook was saved', async () => {
  const calls = [];
  const fs = {
    async mkdir() {},
    async rename(_from, to) { calls.push(['rename', to]); },
    async writeFile() { throw Error('permission denied'); },
    async unlink() { throw Error('must not delete completed workbook'); }
  };
  const workbook = { xlsx: { async writeFile() {} } };
  await assert.rejects(
    saveCommonProcessMonthlyWorkbook(workbook, '2026-11', '/templates/common.xlsx', 4,
      { fs, getMonthlyTarget: () => target }),
    error => error.code === 'EXCEL_METADATA_WRITE_FAILED'
      && error.archivePath === target.filePath
      && error.cause?.message === 'permission denied'
  );
  assert.deepEqual(calls, [['rename', target.filePath]]);
});

test('Excel persistence cleans up temporary workbook if rename fails', async () => {
  const calls = [];
  const fs = {
    async mkdir() {},
    async rename() { throw Error('rename denied'); },
    async writeFile() { throw Error('metadata must not run'); },
    async unlink(file) { calls.push(file); }
  };
  const workbook = { xlsx: { async writeFile() {} } };
  await assert.rejects(saveCommonProcessMonthlyWorkbook(workbook, '2026-11', '/templates/common.xlsx', 4,
    { fs, getMonthlyTarget: () => target }), /rename denied/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].endsWith('.tmp'));
});
