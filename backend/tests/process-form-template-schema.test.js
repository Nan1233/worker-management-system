const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processFormSchemas.ts'), 'utf8');
const page = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/ProcessPage.tsx'), 'utf8');
const masterDataCache = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/masterDataCache.ts'), 'utf8');
const productionService = fs.readFileSync(path.join(__dirname, '../../frontend/src/services/productionService.ts'), 'utf8');
const timeSection = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/components/ProcessTimeDeductionSection.tsx'), 'utf8');
const masterHook = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/useProcessMasterData.ts'), 'utf8');
const submission = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processReportSubmission.ts'), 'utf8');
const payload = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processReportPayload.ts'), 'utf8');
const pageUi = `${page}\n${timeSection}`;

test('worker schemas preserve process-specific input and database-managed deduction groups', () => {
  // Ép's hâm/sửa/dừng machine deductions are dynamic master data, not fixed
  // independent inputs in the worker form. Keep the actual process-specific
  // fields while avoiding a duplicate static entry for each deduction type.
  assert.match(schema, /Trừ giờ Ép:.*hâm khuôn, sửa khuôn, sửa máy.*dừng máy/);
  assert.match(schema, /kind: "deduction-list"/);
  assert.match(schema, /Ngày tháng Ép/);
  assert.match(schema, /Công việc trừ giờ/);
  assert.match(schema, /Trừ giờ XLBV \(người làm\)/);
  assert.match(schema, /Thời gian dừng thao tác/);
  assert.match(schema, /Số thau\/thời gian liên quan/);
  // User decision: DO does NOT expose "Máy mài liên quan" in worker input.
  const extraFields = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processExtraFields.ts'), 'utf8');
  assert.match(extraFields, /do:\s*\[\s*\]/);
  assert.doesNotMatch(extraFields, /key:\s*"grinding_machine_no"/);
});

test('worker deduction catalogue remains process scoped through cache and API contract', () => {
  assert.match(masterHook, /getCachedDeductions\(resolvedProcessId\)/);
  assert.match(masterDataCache, /getCachedDeductions = \(processId: number\)/);
  assert.match(masterDataCache, /getDeductionOptionsByProcess\(canonicalId\)/);
  assert.match(productionService, /`\/processes\/\$\{processId\}\/deductions`/);
  assert.match(page, /activeDeductionOptions/);
  assert.match(payload, /deduction_type_id:/);
  assert.match(payload, /deduction_code:/);
});

test('deduction keys stay string-safe for payload and form attributes', () => {
  const config = fs.readFileSync(path.join(__dirname, '../../frontend/src/pages/worker/processPageConfig.ts'), 'utf8');
  assert.match(config, /Extract<keyof DeductionState, string>/);
  assert.match(payload, /deduction_code:\s*String\(item\.code/);
  assert.match(pageUi, /htmlFor=\{\s*String\(item\.key\)\s*\}/);
  assert.match(pageUi, /id=\{\s*String\(item\.key\)\s*\}/);
  assert.match(pageUi, /name=\{\s*String\(item\.key\)\s*\}/);
});
