const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('formula settings stay server-side only; the public management screen and API are retired', () => {
  // edb385c0 removed the FormulaSettings screen and formulaSettingsRoutes answers 404 for every call.
  const controller = read('backend/controllers/formulaSettingsController.js');
  const service = read('backend/services/formulaSettingsService.js');
  assert.match(controller, /updateScope/);
  assert.match(controller, /resetScope/);
  assert.match(service, /ENTERED_X_TRAINING/);
  assert.match(service, /threshold_red/);
  assert.match(service, /threshold_green/);
  assert.equal(fs.existsSync(path.join(root, 'frontend/src/pages/admin/FormulaSettings.tsx')), false);
  assert.match(read('backend/routes/formulaSettingsRoutes.js'), /FORMULA_FEATURE_REMOVED/);
  assert.doesNotMatch(read('frontend/src/routes/AppRouter.tsx'), /FormulaSettings/);
});

test('Excel receives formula settings and uses adjusted output', () => {
  const api = read('backend/controllers/companyExcelDataController.js');
  const excel = read('desktop/electron/monthlyWorkbookLocal.cjs');
  assert.match(api, /formulaSettings/);
  assert.match(api, /getSettingsMap/);
  assert.match(excel, /formulaSettingsFor/);
  assert.match(excel, /enteredOutput/);
  assert.match(excel, /Tổng SP quy đổi/);
  assert.match(excel, /achievementColor/);
  assert.match(excel, /currentDate !== previousDate/);
});
