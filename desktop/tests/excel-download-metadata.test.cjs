'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDownloadFileName, normalizeProcessInfo } = require('../electron/excelDownloadMetadata.cjs');

const response = (disposition) => ({
  headers: { get: (name) => name === 'content-disposition' ? disposition : null },
});

test('download name prefers RFC 5987 UTF-8 filename over ordinary filename', () => {
  assert.equal(parseDownloadFileName(response('attachment; filename="fallback.xlsx"; filename*=UTF-8\'\'B%C3%A1o-c%C3%A1o.xlsx'), 'default.xlsx'), 'Báo-cáo.xlsx');
});

test('download name preserves old fallback and invalid percent-escape semantics', () => {
  assert.equal(parseDownloadFileName(response(''), 'report.xlsx'), 'report.xlsx');
  assert.equal(parseDownloadFileName(response('attachment; filename="test.xlsx"'), 'report.xlsx'), 'test.xlsx');
  assert.equal(parseDownloadFileName(response("attachment; filename*=UTF-8''bad%ZZ.xlsx"), 'report.xlsx'), 'bad%ZZ.xlsx');
});

test('process metadata keeps API aliases, precedence and original record fields', () => {
  const actual = normalizeProcessInfo({
    process_id: '2', process_code: 'MAI', process_name: 'Mài', custom: true,
  });
  assert.deepEqual(actual, { process_id: '2', process_code: 'MAI', process_name: 'Mài', custom: true, id: 2, processCode: 'MAI', processName: 'Mài' });
  const preferred = normalizeProcessInfo({ id: '7', processId: 8, processCode: 'K1', code: 'GC', processName: 'Kiểm 1', name: 'Other' });
  assert.equal(preferred.id, 7);
  assert.equal(preferred.processCode, 'K1');
  assert.equal(preferred.processName, 'Kiểm 1');
});

test('missing process id remains NaN for existing caller validation', () => {
  const result = normalizeProcessInfo({ code: 'GC' });
  assert.equal(Number.isNaN(result.id), true);
  assert.equal(result.processCode, 'GC');
  assert.equal(result.processName, '');
});
