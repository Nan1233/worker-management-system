'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workbookSourcePath = path.resolve(
  __dirname,
  '../../desktop/electron/monthlyWorkbookLocal.cjs'
);

const source = fs.readFileSync(workbookSourcePath, 'utf8');

test('monthly workbook freezes only through worker name', () => {
  assert.match(
    source,
    /xSplit:\s*4/,
    'Workbook phải cố định đúng 4 cột dữ liệu: STT, Thời gian nhập, Mã NV và Tên NV'
  );

  assert.match(
    source,
    /topLeftCell:\s*'E6'/,
    'Cột bắt đầu cuộn phải là cột E'
  );

  assert.match(
    source,
    /activeCell:\s*'E6'/,
    'Ô hoạt động sau vùng freeze phải là E6'
  );
});

test('monthly workbook resets sequence for each report date', () => {
  assert.match(
    source,
    /if\s*\(currentDate !== previousDate\)\s*\{/,
    'Workbook phải nhận biết khi chuyển sang ngày báo cáo mới'
  );

  assert.match(
    source,
    /sequenceInDate\s*=\s*0/,
    'STT phải được đặt lại khi bắt đầu ngày mới'
  );

  assert.match(
    source,
    /sequenceInDate\s*\+=\s*1/,
    'STT phải tăng lần lượt trong cùng một ngày'
  );

  assert.match(
    source,
    /values\.stt\s*=\s*sequenceInDate/,
    'STT theo ngày phải được ghi vào dòng dữ liệu'
  );

  assert.match(
    source,
    /sheet\.mergeCells\(currentRowNumber,\s*1,\s*currentRowNumber,\s*4\)/,
    'Hàng phân cách ngày phải gộp A:D để ngày không hiện ###'
  );

  assert.match(
    source,
    /dateCell\.value\s*=\s*reportDate/,
    'Hàng phân cách ngày phải lấy ngày báo cáo từ work_date và ghi dạng text'
  );
});

test('monthly reports are ordered by report date and input time', () => {
  assert.match(
    source,
    /dateKey\(a\.work_date\)\.localeCompare\(dateKey\(b\.work_date\)\)/,
    'Báo cáo phải được nhóm theo ngày báo cáo'
  );

  assert.match(
    source,
    /reportTimeKey\(a\)\.localeCompare\(reportTimeKey\(b\)\)/,
    'Trong cùng ngày phải ưu tiên thứ tự thời gian'
  );
});
