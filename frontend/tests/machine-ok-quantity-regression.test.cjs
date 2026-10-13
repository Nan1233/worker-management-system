const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('machine report payload preserves each machine line OK quantity', () => {
  const submission = read('src/pages/worker/processReportSubmission.ts');
  const basicInfo = read('src/pages/worker/components/ProcessBasicInfoSection.tsx');

  assert.match(basicInfo, /value=\{line\.okQuantity\}/);
  assert.match(basicInfo, /updateMachineLine\(index, \{ okQuantity: event\.target\.value\.replace\(\/\\D\/g, ""\) \}\)/);
  assert.match(submission, /ok_quantity:num\(l\.okQuantity\)/);
  assert.match(submission, /tt_ok:\(noStandardLongWork \|\| isMachineLineAccounting\) \? 0/);
});

test('single-machine payload does not overwrite line OK/NG with stale parent totals', () => {
  const submission = read('src/pages/worker/processReportSubmission.ts');

  assert.match(submission, /const selectedMachineLine = lines\.find/);
  assert.match(submission, /ok_quantity:selectedMachineLine \? num\(selectedMachineLine\.ok_quantity\) : num\(args\.form\.ttOk\)/);
  assert.match(submission, /ng_quantity:selectedMachineLine \? num\(selectedMachineLine\.ng_quantity\) : num\(args\.form\.ttNg\)/);
});
