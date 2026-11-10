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
  assert.ok(page.includes('if (["MAI", "DO"].includes(processCode) && !String(form.machineNo || "").trim())'));
  assert.ok(page.includes('return toProductAutocompleteOptions(scopedProductOptions);'));
  assert.ok(page.includes('if (["MAI", "DO"].includes(processCode) && !String(machineCode || "").trim())'));
  assert.ok(page.includes('return scopedProductOptions;'));
  assert.ok(basic.includes('isMaiStyleProcess ? getMachineProductAutocompleteOptions("") : []'));
});

test('autocomplete never clears a committed selection when focus moves outside', () => {
  const autocomplete = fs.readFileSync(path.join(root, 'src/components/common/AutocompleteInput.tsx'), 'utf8');
  assert.ok(autocomplete.includes('setTypedValue(String(value || ""));'));
  assert.ok(autocomplete.includes('Blur/outside-click must never clear the committed value'));
  assert.ok(!autocomplete.includes('onChange("");'));
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
  assert.ok(basic.includes('loadingMasterData || (!form.machineNo.trim() && processCode !== "DO")'));
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

test('DO, EP and CAN support up to ten machines and mode helpers cannot both be true', () => {
  const machineLines = fs.readFileSync(path.join(root, 'src/pages/worker/processMachineLines.ts'), 'utf8');
  assert.match(machineLines, /(?:DO|EP|CAN)/);
  assert.match(machineLines, /10/);
  assert.ok(domain.includes('return !resolveUsesMultiMachineLines(c, mode);'));
  assert.ok(domain.includes('["GC", "MAI", "DO", "CAN", "EP"].includes(c.processCode)'));
});

// Only GC accounts time per machine line; Mài/Đo/Ép keep the worker-level time (audit BUG-01: zeroing it made those workers' reports fail with 422).
test('machine-line payload does not duplicate worker-level time and OK/NG totals', () => {
  const submission = fs.readFileSync(path.join(root, 'src/pages/worker/processReportSubmission.ts'), 'utf8');
  assert.match(submission, /const isGcMachineLineAccounting = isMachineLineAccounting\s*&& String\(args\.processCode/);
  assert.match(submission, /total_time:\s*isGcMachineLineAccounting\s*\?\s*0\s*:/);
  assert.match(submission, /actual_time:\s*isGcMachineLineAccounting\s*\?\s*0\s*:\s*\(isMaiWithoutMachine \? maiNoMachineActual : actualTime\)/);
  assert.match(submission, /deduction_time:\s*isGcMachineLineAccounting\s*\?\s*0\s*:\s*\(isMaiWithoutMachine \? maiNoMachineDeduction : deductionTime\)/);
  assert.match(submission, /tt_ok:\(isCvk \|\| isNonProductWorkWithinProcess \|\| noStandardLongWork \|\| \(isMachineLineAccounting && !isMaiWithoutMachine\)\) \? 0 : \(isMaiWithoutMachine \? maiNoMachineOk : num\(args\.form\.ttOk\)\)/);
  assert.match(submission, /machine_lines:\(isCvk \|\| isNonProductWorkWithinProcess \|\| isMaiWithoutMachine\) \? \[\] : \(useMachineLinesPayload\?lines:\[\]\)/);
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
  // Mài deductions come from active process-scoped DB rows; hard-coded lists
  // made the dropdown empty when master labels changed.
  assert.ok(!hook.includes('MAI_ALLOWED_DEDUCTION_NAMES'));
  assert.ok(hook.includes('dedupeEncodedOrLegacyDeductions'));
  assert.ok(hook.includes('MAI_ALLOWED_DEFECT_NAMES'));
  assert.ok(hook.includes('MAI_DISPLAY_LABELS'));
  assert.ok(hook.includes('PPCM Mất điện'));
  assert.ok(hook.includes('normalizeDefectOptions(defects.value, resolvedProcessId)'));
  assert.ok(hook.includes('filterMaiMasterOptions(normalized, processCode, resolvedProcessId, MAI_ALLOWED_DEFECT_NAMES'));
  assert.ok(hook.includes('normalizeDeductionOptions(deductions.value, resolvedProcessId)'));
  assert.ok(hook.includes('normalizeDeductionOptions(deductions.value, resolvedProcessId)'));
  assert.ok(hook.includes('dedupeEncodedOrLegacyDeductions('));
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


test('GC Cắt/Lồng classification never guesses from C-prefixed product or machine codes', () => {
  const backend = fs.readFileSync(path.join(root, '..', 'backend/controllers/productStandardController.js'), 'utf8');
  const machineType = fs.readFileSync(path.join(root, 'src/services/gcMachineWorkType.js'), 'utf8');
  assert.ok(backend.includes('ps.work_type'));
  assert.ok(!backend.includes("COALESCE(pa.alias_code, '') ) LIKE 'C%'"));
  assert.ok(!backend.includes("COALESCE(ps.product_code, ''))) LIKE 'C%'"));
  assert.ok(rules.includes('gcWorkTypeOfMachine(machineOptions, selectedRawMachine)'));
  assert.ok(!rules.includes('selectedRawMachine.startsWith("C")'));
  assert.ok(!rules.includes('isGcLongMachine'));
  assert.ok(machineType.includes('return machine ? normalizeGcWorkType(machine.gc_work_type) : null'));
});


test('worker process schema IDs match the live TiDB processes table', () => {
  const schema = fs.readFileSync(path.join(root, 'src/pages/worker/processFormSchemas.ts'), 'utf8');
  const access = fs.readFileSync(path.join(root, 'src/utils/processAccess.ts'), 'utf8');
  const canonical = { GC: 1, MAI: 2, DO: 3, K1: 4, K2: 5, XLBV: 6, EP: 7, CAN: 8, SX3: 9 };
  for (const [code, id] of Object.entries(canonical)) {
    const matches = [...schema.matchAll(new RegExp('processId: (\\d+),\\s*processCode: "' + code + '"', 'g'))];
    assert.equal(matches.length, 2, code + ' must be defined in selection and form schema');
    for (const match of matches) assert.equal(Number(match[1]), id, code + ' has wrong process ID');
    assert.ok(access.includes(code + ': ' + id + ','), code + ' must have canonical access mapping');
  }
  assert.ok(page.includes('useProcessMasterData(processInfo.id, processCode)'));
  assert.ok(page.includes('processId: processInfo.id'));
});

test('CAN material code is embedded in the main form without a duplicate extra section', () => {
  const extra = fs.readFileSync(path.join(root, 'src/pages/worker/processExtraFields.ts'), 'utf8');
  const section = fs.readFileSync(path.join(root, 'src/pages/worker/components/ProcessExtraFieldsSection.tsx'), 'utf8');
  assert.ok(page.includes('inlineExtraFields={processCode === "CAN"'));
  assert.ok(page.includes('processCode !== "CAN" && <ProcessExtraFieldsSection'));
  assert.ok(extra.includes('key: "material_code"'));
  assert.ok(section.includes('inline ? "worker-field-full worker-inline-extra-fields"'));
});


test('manager report tabs and worker edit use canonical TiDB process IDs', () => {
  const manager = fs.readFileSync(path.join(root, 'src/pages/manager/ManagerReportGrid.tsx'), 'utf8');
  const edit = fs.readFileSync(path.join(root, 'src/pages/worker/WorkerReportEditV2.tsx'), 'utf8');
  const patch = fs.readFileSync(path.join(root, 'scripts/patchWorkerReportEdit.cjs'), 'utf8');
  const expected = { CAN: 8, EP: 7, XLBV: 6, GC: 1, MAI: 2, DO: 3, K1: 4, K2: 5 };
  for (const [code, id] of Object.entries(expected)) {
    assert.ok(manager.includes('processId: ' + id + ', processCode: "' + code + '"'), code + ' manager tab must match TiDB');
  }
  assert.ok(edit.includes('getCanonicalProcessId(Number(report?.process_id) || 0, capabilities.processCode)'));
  assert.ok(!edit.includes('const PROCESS_ID_BY_CODE: Record<string, number>'));
  assert.ok(patch.includes('DO: 3, K1: 4, K2: 5, CAN: 8, EP: 7, XLBV: 6, SX3: 9'));
});
