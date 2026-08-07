const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processFormSchemas.ts'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/ProcessPage.tsx'), 'utf8');

test('worker forms keep process-specific fields from file-mau.xlsx', () => {
  assert.match(schema, /Số giờ hâm khuôn/);
  assert.match(schema, /Số giờ sửa khuôn/);
  assert.match(schema, /Số giờ sửa máy/);
  assert.match(schema, /Số giờ dừng máy/);
  assert.match(schema, /Lý do dừng máy/);
  assert.match(schema, /Ngày tháng Ép/);
  assert.match(schema, /Công việc trừ giờ/);
  assert.match(schema, /Trừ giờ XLBV \(người làm\)/);
  assert.match(schema, /Thời gian dừng thao tác/);
  assert.match(schema, /SỐ THAU|Số thau\/thời gian liên quan/);
});

test('worker form loads deduction catalogue by process instead of using GC list for every process', () => {
  assert.match(page, /getDeductionOptionsByProcess/);
  assert.match(page, /activeDeductionOptions/);
  assert.match(page, /deduction_type_id:/);
  assert.match(page, /deduction_code:/);
});

test('deduction keys stay string-safe for payload and form attributes', () => {
  const config = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processPageConfig.ts'), 'utf8');
  assert.match(config, /Extract<keyof DeductionState, string>/);
  assert.match(page, /deduction_code:\s*String\(item\.code\)/);
  assert.match(page, /htmlFor=\{\s*String\(item\.key\)\s*\}/);
  assert.match(page, /id=\{\s*String\(item\.key\)\s*\}/);
  assert.match(page, /name=\{\s*String\(item\.key\)\s*\}/);
});
