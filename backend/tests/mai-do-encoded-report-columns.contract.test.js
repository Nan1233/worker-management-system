'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

test('monthly MAI/DO columns retain encoded defect codes in report headers', () => {
  const source = read('../../desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(source, /code: item\.code/);
  assert.match(source, /function defectColumnHeader\(processCode, type\)/);
  assert.match(source, /MAI_NG_/);
  assert.match(source, /DO_NG_/);
  assert.match(source, /return \`\$\{code\}\\n\$\{label\}\`/);
});

test('original MAI/DO templates expose 7 and 12 encoded NG columns with template styles', () => {
  const source = read('../../desktop/electron/originalProcessExcelTemplate.cjs');
  assert.match(source, /defects:\["AK","AV"\]/);
  assert.match(source, /MAI: \{ prefix:"MAI_NG", start:"AN", styleEnd:"AT"/);
  assert.match(source, /DO: \{ prefix:"DO_NG", start:"AK", styleEnd:"AO"/);
  assert.match(source, /"Trục cong","Lệch điểm","Lỗi cao su","Đảo cs","Lỗi trục","Chưa mài","Mài 2 lần","HỞ VAI"/);
  assert.match(source, /cloneColumnStyle\(sheet,styledEnd,col\)/);
  assert.match(source, /padStart\(2,"0"\)/);
  assert.match(source, /const header=codeLabel\+"\\n"\+name/);
});
