const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'src/pages/worker/productSuggestionRules.ts'), 'utf8');
const domain = fs.readFileSync(path.join(root, 'src/pages/worker/processPageDomain.ts'), 'utf8');
const page = fs.readFileSync(path.join(root, 'src/pages/worker/ProcessPage.tsx'), 'utf8');
const basic = fs.readFileSync(path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx'), 'utf8');


test('product suggestions are scoped by operation mode and selected machine', () => {
  assert.ok(rules.includes('eligibleMachineCodes'));
  assert.ok(rules.includes('GC_AUTOMATIC_MACHINE_CODES'));
  assert.ok(rules.includes('mode === "MANUAL"'));
  assert.ok(rules.includes('mappedMachines.includes(selectedMachine)'));
  assert.ok(rules.includes('const selectedMachine = normalizeMachineKey(machineCode)'));
  assert.ok(rules.includes('Number(machine?.is_automatic || 0) === 1'));
  assert.ok(page.includes('filterProductsForSelection'));
  assert.ok(page.includes('getMachineProductOptions(line.machineCode)'));
  assert.ok(page.includes('useEncodedMachineSuffix: processCode === "GC"'));
});

test('machine relation matching accepts common machine-code formats', () => {
  assert.ok(rules.includes('normalizeMachineKey'));
  assert.ok(rules.includes('MÁY|MAY|MACHINE|M'));
  assert.ok(rules.includes('String(Number(numeric[1]))'));
  assert.ok(rules.includes('.map(normalizeMachineKey)'));
});

test('GC work type matching accepts canonical and business-language values', () => {
  assert.ok(rules.includes('normalizeWorkType'));
  assert.ok(rules.includes('CUT'));
  assert.ok(rules.includes('LONG'));
  assert.ok(domain.includes('normalizeWorkType(product.work_type) === expectedWorkType'));
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

test('worker process crash regression: accounting identifiers stay declared and consistent', () => {
  const submission = fs.readFileSync(path.join(root, 'src/pages/worker/processReportSubmission.ts'), 'utf8');
  assert.ok(submission.includes('const isMachineLineAccounting = useMachineLinesPayload;'));
  assert.ok(submission.includes('isMachineLineAccounting'));
  assert.ok(page.includes('usesMultiMachineLines'));
  assert.ok(!page.includes('usesGiaCongMachineAccounting'));
});

test('worker quality section runs hooks before mode-dependent early returns', () => {
  const quality = fs.readFileSync(path.join(root, 'src/pages/worker/components/ProcessQualitySection.tsx'), 'utf8');
  const stateHook = quality.indexOf('useState<');
  const layoutEffectHook = quality.indexOf('useLayoutEffect(');
  const effectHook = quality.indexOf('useEffect(');
  const hiddenReturn = quality.indexOf('if (shouldHide) return null;');
  assert.ok(stateHook >= 0 && layoutEffectHook > stateHook && effectHook > layoutEffectHook);
  assert.ok(hiddenReturn > effectHook);
  assert.ok(!quality.includes('if (usesMultiMachineLines) return null;'));
});

test('DO and EP remain limited to one machine and mode helpers cannot both be true', () => {
  const machineLines = fs.readFileSync(path.join(root, 'src/pages/worker/processMachineLines.ts'), 'utf8');
  assert.ok(machineLines.includes('if (["DO", "EP"].includes(processCode)) return 1;'));
  assert.ok(domain.includes('return !resolveUsesMultiMachineLines(c, mode);'));
});

test('machine-line payload does not duplicate worker-level time and OK/NG totals', () => {
  const submission = fs.readFileSync(path.join(root, 'src/pages/worker/processReportSubmission.ts'), 'utf8');
  assert.ok(submission.includes('total_time:isMachineLineAccounting ? 0 : totalTime'));
  assert.ok(submission.includes('actual_time:isMachineLineAccounting ? 0 : actualTime'));
  assert.ok(submission.includes('deduction_time:isMachineLineAccounting ? 0 : deductionTime'));
  assert.ok(submission.includes('tt_ok:(isCvk || isNonProductWorkWithinProcess || noStandardLongWork || isMachineLineAccounting) ? 0 : num(args.form.ttOk)'));
  assert.ok(submission.includes('machine_lines:useMachineLinesPayload?lines:[]'));
});

test('basic info section destructures machineOptions before rendering machine labels', () => {
  const basicInfo = fs.readFileSync(path.join(root, 'src/pages/worker/components/ProcessBasicInfoSection.tsx'), 'utf8');
  assert.ok(basicInfo.includes('productOptions, machineAutocompleteOptions, machineOptions, loadingMasterData'), 'machineOptions must be destructured from Props before JSX uses it');
  assert.ok(basicInfo.includes('machineOptions as Array<{ process_code?: string; process_name?: string }>'));
});

test('time deduction section does not reference an undeclared machineOptions identifier', () => {
  const timeSection = fs.readFileSync(path.join(root, 'src/pages/worker/components/ProcessTimeDeductionSection.tsx'), 'utf8');
  assert.ok(!timeSection.includes('machineOptions'), 'time deduction component must not use machineOptions unless it is explicitly declared');
});


test('Mài worker master only exposes the approved time deductions and NG types', () => {
  const master = require(path.join(root, '..', 'backend/config/ktcTemplateMasterData.js'));
  const mai = master.MAI;
  const hook = fs.readFileSync(path.join(root, 'src/pages/worker/useProcessMasterData.ts'), 'utf8');

  assert.equal(mai.deductions.length, 11);
  assert.equal(mai.defects.length, 7);
  assert.ok(!mai.deductions.includes('Thiếu sản lượng'));
  assert.ok(!mai.deductions.includes('Bảo dưỡng máy'));
  assert.ok(!mai.deductions.includes('Mất điện'));
  assert.ok(hook.includes('MAI_ALLOWED_DEDUCTION_NAMES'));
  assert.ok(hook.includes('MAI_ALLOWED_DEFECT_NAMES'));
  assert.ok(hook.includes('MAI_DISPLAY_LABELS'));
  assert.ok(hook.includes('PPCM Mất điện'));
  assert.ok(hook.includes('normalizeDefectOptions(defects.value, resolvedProcessId)'));
  assert.ok(hook.includes('filterMaiMasterOptions(normalized, processCode, resolvedProcessId, MAI_ALLOWED_DEFECT_NAMES'));
  assert.ok(hook.includes('normalizeDeductionOptions(deductions.value, resolvedProcessId)'));
  assert.ok(hook.includes('filterMaiMasterOptions(normalizeDeductionOptions(deductions.value, resolvedProcessId)'));
});

test('production bundle version replacement matches the frontend and service-worker version', () => {
  const version = fs.readFileSync(path.join(root, 'src/config/version.ts'), 'utf8');
  const serviceWorker = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
  const forceVersion = fs.readFileSync(path.join(root, 'scripts/forceFrontendVersion.cjs'), 'utf8');
  const frontendVersion = version.match(/FRONTEND_VERSION = "([^"]+)"/)?.[1];
  const forcedVersion = forceVersion.match(/const VERSION = "([^"]+)"/)?.[1];
  const workerVersion = serviceWorker.match(/const BUILD_VERSION = "([^"]+)"/)?.[1];
  assert.ok(frontendVersion);
  assert.ok(forcedVersion);
  assert.ok(workerVersion);
  assert.equal(forcedVersion, frontendVersion);
  assert.ok(workerVersion.startsWith(frontendVersion));
});
