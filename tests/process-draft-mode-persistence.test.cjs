const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('worker draft persists and restores the sibling CVK work option', () => {
  const page = read('frontend/src/pages/worker/ProcessPage.tsx');
  const storage = read('frontend/src/pages/worker/processDraftStorage.ts');
  assert.match(page, /setIsCvkMode\(Boolean\(draft\.isCvkMode \|\| String\(draft\.form\?\.workType \|\| ""\)\.toUpperCase\(\) === "CVK"\)\)/);
  assert.match(page, /isCvkMode,\s*cutExecutionMode,/);
  assert.match(storage, /isCvkMode\?: boolean/);
  assert.match(storage, /f\.workType \|\| draft\.isCvkMode/);
});

test('worker draft persists cutting AUTO/NON_AUTO mode and makes it controlled by ProcessPage', () => {
  const page = read('frontend/src/pages/worker/ProcessPage.tsx');
  const basic = read('frontend/src/pages/worker/components/ProcessBasicInfoSection.tsx');
  const storage = read('frontend/src/pages/worker/processDraftStorage.ts');
  assert.match(page, /setCutExecutionMode\(draft\.cutExecutionMode === "NON_AUTO" \? "NON_AUTO" : "AUTO"\)/);
  assert.match(page, /cutExecutionMode=\{cutExecutionMode\}/);
  assert.match(basic, /cutExecutionMode: CutExecutionMode; setCutExecutionMode: Dispatch<SetStateAction<CutExecutionMode>>/);
  assert.doesNotMatch(basic, /const \[cutExecutionMode, setCutExecutionMode\] = useState/);
  assert.match(storage, /cutExecutionMode\?: "AUTO" \| "NON_AUTO"/);
});
