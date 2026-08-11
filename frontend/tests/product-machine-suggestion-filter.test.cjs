const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'src/pages/worker/productSuggestionRules.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/pages/worker/ProcessPage.tsx'), 'utf8');
const basic = fs.readFileSync(path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx'), 'utf8');

test('product suggestions are scoped by operation mode and selected machine', () => {
  assert.ok(rules.includes('getProductMachineHint'));
  assert.ok(rules.includes('AUTO|AUTOMATIC|\\d+'));
  assert.ok(rules.includes('mode === "MANUAL"'));
  assert.ok(rules.includes('mappedMachines.includes(selectedMachine)'));
  assert.ok(rules.includes('hint.value === selectedNumber'));
  assert.ok(rules.includes('isAutomatic'));
  assert.ok(page.includes('filterProductsForSelection'));
  assert.ok(page.includes('getMachineProductOptions(line.machineCode)'));
  assert.ok(page.includes('useEncodedMachineSuffix: processCode === "GC"'));
});

test('single-machine processes force machine selection before product search', () => {
  assert.ok(basic.includes('!usesMultiMachineLines && !usesSingleMachine'));
  assert.ok(basic.includes('"Chọn máy trước"'));
  assert.ok(basic.includes('loadingMasterData || !form.machineNo.trim()'));
});

test('changing a machine clears the previous product so stale machine products cannot survive', () => {
  assert.ok(basic.includes('machineCode: value, productCode: ""'));
  assert.ok(basic.includes('machineCode: option.value, productCode: ""'));
});
