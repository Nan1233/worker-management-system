'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const dir = path.resolve(__dirname, '../src/pages/worker');

function getHelpers(name) {
  const source = fs.readFileSync(path.join(dir, name), 'utf8');
  const outputText = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, spec => {
    if(spec==='./processPageConfig')return config;
    if(spec==='./processDeductionLogic')return deductionLogic;
    if(spec==='./processFormUtils')return {MAX_TOTAL_WORK_MINUTES:12*60};
    if(spec==='./processFormSchemas')return {PROCESS_FORM_SCHEMAS:{}};
    if(spec==='../../utils/processAccess')return {getCanonicalProcessId:id=>id};
    throw Error('Unexpected runtime import: '+spec);
  });
  return mod.exports;
}
const config=getHelpers('processPageConfig.ts');
const deductionLogic = getHelpers('processDeductionLogic.ts');
const { toggleSelectedDeductionKeys, transitionSelectedDeduction } = deductionLogic;
const { useProcessDeductionActions } = getHelpers('useProcessDeductionActions.ts');
const { hasProcessReportInput } = getHelpers('processFormResetGuard.ts');

test('selection toggles are pure, stable and idempotent', () => {
  const keys = ['giaoCa'];
  assert.strictEqual(toggleSelectedDeductionKeys(keys, 'giaoCa', true), keys);
  assert.deepEqual(toggleSelectedDeductionKeys(keys, 'fiveS', true), ['giaoCa', 'fiveS']);
  assert.deepEqual(toggleSelectedDeductionKeys(keys, 'giaoCa', false), []);
  assert.deepEqual(keys, ['giaoCa']);
});
test('deduction checkbox retains saved time when checked and clears when unchecked', () => {
  const prev = { giaoCa: '70', fiveS: '', nghiGiaiLao: '0' };
  assert.equal(transitionSelectedDeduction(prev, 'giaoCa', true).giaoCa, '70');
  assert.equal(transitionSelectedDeduction(prev, 'fiveS', true).fiveS, '');
  assert.equal(transitionSelectedDeduction(prev, 'nghiGiaiLao', true).nghiGiaiLao, '0');
  assert.equal(transitionSelectedDeduction(prev, 'giaoCa', false).giaoCa, '');
  assert.deepEqual(prev, { giaoCa: '70', fiveS: '', nghiGiaiLao: '0' });
});
test('reset prompts exactly when production inputs are present', () => {
  const empty = {...config.initialForm};
  const lines = [config.createEmptyMachineLine()];
  assert.equal(hasProcessReportInput(empty, [], [], lines), false);
  for (const [key, value] of Object.entries({ productName: 'P1', machineNo: 'M1', actualTime: '0.5', ttOk: '12', ttNg: '1' })) {
    assert.equal(hasProcessReportInput({ ...empty, [key]: value }, [], [], lines), true, key);
  }
  assert.equal(hasProcessReportInput(empty, ['cat01'], [], lines), true);
  assert.equal(hasProcessReportInput(empty, [], ['giaoCa'], lines), true);
  for (const [key, value] of Object.entries({ machineCode: 'M2', productCode: 'P2', okQuantity: '25', ngQuantity: '1', hours: '2', minutes: '15' })) {
    assert.equal(hasProcessReportInput(empty, [], [], [{ ...lines[0], [key]: value }]), true, key);
  }
  assert.equal(hasProcessReportInput({ ...empty, ttOk: '0', ttNg: '0', actualTime: '0' }, [], [], lines), true);
  for(const key of ['materialCode','grindingMachineNo','otherNgName','otherDeductionName']) {
    assert.equal(hasProcessReportInput(empty,[],[],[{...lines[0],[key]:'entered'}]),true,key);
  }
});
test('worker form still calls submission builder after extracting reset and checkbox logic', () => {
  const source = fs.readFileSync(path.join(dir, 'ProcessPage.tsx'), 'utf8');
  const reset=fs.readFileSync(path.join(dir,'useProcessReset.ts'),'utf8');
  assert.match(source, /useProcessDeductionActions\(\{\s*form, deductions, setForm, setDeductions/);
  assert.match(source, /onToggleDeduction=\{handleToggleDeduction\}/);
  assert.match(reset, /hasProcessReportInput\(form, selectedNg, selectedDeduction, machineLines, deductions, extraData\)/);
  assert.match(source, /buildProductionReportPayloads\(\{/);
});

/** Exercise the actual action module. Replay functional state updates to
 * detect nested state writes/toasts that React StrictMode may repeat. */
function actionHarness(hours='7', minutes='0', initial={giaoCa:'70'}, selected=['giaoCa']) {
  const state={form:{...config.initialForm,actualHours:hours,actualMinutes:minutes},deductions:{...initial},selected:[...selected]};
  const warnings=[];
  let inUpdater=false;
  function setter(key) {
    return next => {
      assert.equal(inUpdater,false,'state updates must not be nested inside another updater');
      if(typeof next!=='function'){state[key]=next;return;}
      inUpdater=true;
      try {
        const before=state[key];
        const first=next(before);
        const replay=next(before);
        assert.deepEqual(first,replay,'updaters must be replay-safe');
        state[key]=replay;
      } finally {inUpdater=false;}
    };
  }
  const actions=()=>useProcessDeductionActions({
    form:state.form,deductions:state.deductions,setForm:setter('form'),
    setDeductions:setter('deductions'),setSelectedDeduction:setter('selected'),
    showToast:(message,tone)=>{assert.equal(inUpdater,false,'toast must be outside updater');warnings.push({message,tone});}
  });
  return {state,warnings,actions};
}

test('actual deduction actions preserve entered time, update totals, and clear unchecked details without nested updates',()=>{
  const {state,warnings,actions}=actionHarness();
  actions().handleToggleDeduction('giaoCa',true);
  assert.equal(state.deductions.giaoCa,'70');
  assert.equal(Number(state.form.actualTime),7);
  assert.equal(Number(state.form.deductionTime),70/60);
  assert.equal(Number(state.form.totalTime),490/60);
  actions().updateDeductionValue('fiveS','20,5');
  assert.equal(state.deductions.fiveS,'20.5');
  assert.equal(Number(state.form.deductionTime),90.5/60);
  actions().normalizeDeductionValue('fiveS');
  assert.equal(state.deductions.fiveS,'20.5');
  actions().handleToggleDeduction('giaoCa',false);
  assert.equal(state.deductions.giaoCa,'');
  assert.deepEqual(state.selected,[]);
  assert.equal(Number(state.form.totalTime),440.5/60);
  assert.deepEqual(warnings,[]);
});

test('actual deduction actions preserve the 12-hour net-work limit and do not count excluded support time against it',()=>{
  const atLimit=actionHarness('12','0',{giaoCa:''},[]);
  atLimit.actions().updateDeductionValue('giaoCa','60');
  assert.equal(Number(atLimit.state.form.actualTime),12);
  assert.equal(Number(atLimit.state.form.deductionTime),1);
  assert.equal(Number(atLimit.state.form.totalTime),13);
  assert.deepEqual(atLimit.warnings,[]);
  const before=structuredClone(atLimit.state);
  atLimit.actions().updateDeductionValue('giaoCa','721');
  assert.deepEqual(atLimit.state,before);
  assert.equal(atLimit.warnings.length,1);
  assert.equal(atLimit.warnings[0].tone,'warning');
  const overLimit=actionHarness('12','1',{giaoCa:'20'});
  const previous=structuredClone(overLimit.state);
  overLimit.actions().updateDeductionValue('giaoCa','30');
  assert.deepEqual(overLimit.state,previous);
  assert.equal(overLimit.warnings.length,1);
});
