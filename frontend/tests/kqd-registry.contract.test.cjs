const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('KQD exclusion remains master-data driven and is not user-editable in report/master UI', () => {
  const workerPage = read('frontend/src/pages/worker/ProcessPage.tsx');
  const workerEdit = read('frontend/src/pages/worker/WorkerReportEditV2.tsx');
  const masterPage = read('frontend/src/pages/admin/MasterData.tsx');
  const formulaRoutes = read('backend/routes/formulaSettingsRoutes.js');

  // The worker resolves the rule from the product standard; there is no worker toggle.
  assert.match(workerPage, /resolvedReportKqdPolicy/);
  assert.match(workerPage, /setResolvedReportKqdPolicy\(Number\(resolved\.exclude_kqd_from_tt/);
  assert.doesNotMatch(workerPage, /Quy tắc KQD theo sản phẩm|name=["']exclude_kqd_from_tt["']/);
  assert.doesNotMatch(workerEdit, /exclude_kqd_from_tt|excludeKqdFromTt|Quy tắc KQD theo sản phẩm/);
  assert.doesNotMatch(masterPage, /exclude_kqd_from_tt|excludeKqdFromTt|Quy tắc KQD theo sản phẩm/);

  // The old public formula UI/API is intentionally disabled.
  assert.match(formulaRoutes, /FORMULA_FEATURE_REMOVED/);
});

test('build patch script does not restore removed KQD UI exports', () => {
  assert.doesNotMatch(read('frontend/scripts/patchManagerReportSave.cjs'), /KQD_CODES|kqdExclusionRegistry/);
});

test('KQD defect remains mapped as NG in report submission', () => {
  const source = read('frontend/src/pages/worker/processReportSubmission.ts');
  assert.match(source, /\["kqdDapLai",\s*"KQD",\s*"KQD"\]/);
  assert.match(source, /\["kqdTuot",\s*"KQD",\s*"KQD"\]/);
});
