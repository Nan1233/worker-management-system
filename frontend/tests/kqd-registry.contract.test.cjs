const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));

// Business decision 2026-11-04: KQD is ordinary NG everywhere. No flag, registry or
// product rule may exclude it from NG or from actual output.
const KQD_FLAG = /exclude_kqd_from_tt|excludeKqdFromTt|kqd_excluded|kqdExclusionRegistry|KQD_CODES|resolvedReportKqdPolicy/;

function loadFormUtils() {
  const source = read('frontend/src/pages/worker/processFormUtils.ts');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, require);
  return mod.exports;
}

test('worker form counts KQD as ordinary NG in counted NG and actual output', () => {
  const { calculateCountedNg, calculateActualOutput } = loadFormUtils();
  const options = [{ key: 'kqdDapLai', code: 'KQD' }, { key: 'kqdTuot', code: 'KQD' }, { key: 'voDoLong', code: 'VO_CAO_SU' }];
  const values = { ttOk: '100', kqdDapLai: '3', kqdTuot: '2', voDoLong: '5' };
  assert.equal(calculateCountedNg(values, options), 10, 'KQD must not be removed from NG');
  assert.equal(calculateActualOutput(values, options), 110, 'actual output = OK + every NG incl. KQD');
  // Extra legacy arguments (old excludeKqd=true call shape) must have no effect.
  assert.equal(calculateActualOutput(values, options, true, new Set(['KQD'])), 110);
  // Other NG types unchanged.
  assert.equal(calculateCountedNg({ voDoLong: '5' }, options), 5);
});

test('frontend and backend use the same actual-output rule (OK + all NG incl. KQD)', () => {
  const { calculateActualOutput: frontend } = loadFormUtils();
  const { calculateProductionOutput } = require(path.join(root, 'shared/productionOutput.cjs'));
  const options = [{ key: 'kqdDapLai', code: 'KQD' }, { key: 'loiCaoSu', code: 'LCS' }];
  for (const [ok, kqd, lcs] of [[0, 0, 0], [50, 7, 0], [120, 4, 9], [1, 0, 3]]) {
    const backend = calculateProductionOutput({ ok, defects: [{ defect_code: 'KQD', quantity: kqd }, { defect_code: 'LCS', quantity: lcs }] });
    assert.equal(frontend({ ttOk: String(ok), kqdDapLai: String(kqd), loiCaoSu: String(lcs) }, options), backend.actualOutput);
    assert.equal(backend.countedNg, kqd + lcs);
  }
});

test('no business branch reads a KQD exclusion flag in worker UI, backend, desktop or Excel', () => {
  for (const file of [
    'frontend/src/pages/worker/ProcessPage.tsx',
    'frontend/src/pages/worker/WorkerReportEditV2.tsx',
    'frontend/src/pages/worker/processFormUtils.ts',
    'frontend/src/pages/worker/processPageConfig.ts',
    'frontend/src/pages/worker/processReportSubmission.ts',
    'frontend/src/services/masterDataService.ts',
    'frontend/src/pages/admin/MasterData.tsx',
    'backend/services/consolidatedExcelExportService.js',
    'backend/services/productionOutputCalculationService.js',
    'backend/utils/outputCalculation.js',
    'backend/controllers/masterDataTransferController.js',
    'backend/controllers/formulaSettingsController.js',
    'desktop/electron/productionCalculationEngine.cjs',
    'shared/productionOutput.cjs',
  ]) assert.doesNotMatch(read(file), KQD_FLAG, `${file} must not use a KQD exclusion flag`);
  assert.equal(exists('shared/kqdExclusionRegistry.json'), false, 'KQD exclusion registry must stay removed');
  assert.match(read('backend/routes/formulaSettingsRoutes.js'), /FORMULA_FEATURE_REMOVED/);
});

test('build patch script does not restore removed KQD UI exports', () => {
  assert.doesNotMatch(read('frontend/scripts/patchManagerReportSave.cjs'), /KQD_CODES|kqdExclusionRegistry/);
});

test('KQD defect remains mapped as NG in report submission', () => {
  const source = read('frontend/src/pages/worker/processReportSubmission.ts');
  assert.match(source, /\["kqdDapLai",\s*"KQD",\s*"KQD"\]/);
  assert.match(source, /\["kqdTuot",\s*"KQD",\s*"KQD"\]/);
});
