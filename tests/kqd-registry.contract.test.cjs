const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isKqdDefect, KQD_EXCLUSION_CODES } = require('../shared/kqdPolicy.cjs');

test('Worker KQD preview shares the explicit configured registry and never prefix-matches unknown codes', () => {
  assert.deepEqual(KQD_EXCLUSION_CODES, ['KQD']);
  assert.equal(isKqdDefect('KQD'), true);
  assert.equal(isKqdDefect('KQD_TEST'), false);
  const config = fs.readFileSync(path.join(__dirname, '../src/pages/worker/processPageConfig.ts'), 'utf8');
  const utils = fs.readFileSync(path.join(__dirname, '../src/pages/worker/processFormUtils.ts'), 'utf8');
  assert.match(config, /kqdExclusionRegistry\.json/);
  assert.match(config, /new Set\(kqdExclusionRegistry/);
  assert.match(utils, /kqdCodes\.has\(code\)/);
  assert.doesNotMatch(utils, /startsWith\(['"]KQD/);
});

test('Worker preview 90 OK + 6 normal NG + 4 configured KQD counts 96 while KQD_TEST counts normally', () => {
  const calculate = ({ ok, defects, exclude }) => {
    const countedNg = defects.reduce((sum, defect) => sum + (exclude && isKqdDefect(defect) ? 0 : Number(defect.quantity || 0)), 0);
    return Number(ok) + countedNg;
  };
  assert.equal(calculate({ ok: 90, defects: [{ defect_code:'BAVIA',quantity:6 },{ defect_code:'KQD',quantity:4 }], exclude:true }), 96);
  assert.equal(calculate({ ok: 90, defects: [{ defect_code:'BAVIA',quantity:6 },{ defect_code:'KQD_TEST',quantity:4 }], exclude:true }), 100);
});


test('Worker historical KQD preview does not fall back to mutable current product policy', () => {
  const page = fs.readFileSync(path.join(__dirname, '../src/pages/worker/ProcessPage.tsx'), 'utf8');
  const basic = fs.readFileSync(path.join(__dirname, '../src/pages/worker/components/ProcessBasicInfoSection.tsx'), 'utf8');
  assert.match(page, /resolveProductStandard\([\s\S]*form\.workDate/);
  assert.match(page, /resolvedReportKqdPolicy === true/);
  assert.doesNotMatch(page, /resolvedReportKqdPolicy \?\? \(Number\(selectedProduct\?\.exclude_kqd_from_tt/);
  assert.doesNotMatch(basic, /exclude_kqd_from_tt/);
});
