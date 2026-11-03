const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('worker and manager/admin UI no longer exposes KQD exclusion policy', () => {
  for (const relative of [
    'frontend/src/pages/worker/ProcessPage.tsx',
    'frontend/src/pages/worker/WorkerReportEditV2.tsx',
    'frontend/src/pages/admin/MasterData.tsx',
    'frontend/src/pages/admin/FormulaSettings.tsx',
    'frontend/src/services/masterDataService.ts',
    'frontend/src/types/production.ts'
  ]) {
    const source = read(relative);
    assert.doesNotMatch(source, /exclude_kqd_from_tt|excludeKqdFromTt|Quy tắc KQD theo sản phẩm/);
  }
});

test('build patch script does not restore removed KQD UI exports', () => {
  assert.doesNotMatch(read('frontend/scripts/patchManagerReportSave.cjs'), /KQD_CODES|kqdExclusionRegistry/);
});

test('KQD defect remains mapped as NG in report submission', () => {
  const source = read('frontend/src/pages/worker/processReportSubmission.ts');
  assert.match(source, /\["kqdDapLai",\s*"KQD",\s*"KQD"\]/);
  assert.match(source, /\["kqdTuot",\s*"KQD",\s*"KQD"\]/);
});
