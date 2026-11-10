'use strict';
// Regression test: the worker submit flow must be a single click. There used
// to be an extra "Xác nhận nộp báo cáo" dialog shown after "Nộp dữ liệu"
// (a client-side daily-hours preview fetched over the network before letting
// the worker actually submit). That second confirmation step is removed;
// clicking "Nộp dữ liệu" now validates and submits in the same action.
// The server-authoritative 12h/day cap (productionTempCreateModel.js /
// productionTempUpdateModel.js: enforceDailyHoursLocked) still runs on every
// submit and is unaffected by this change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// --- Behavioral: execute the real click-handler logic, not a source regex ---
// ProcessSubmitActions.tsx itself contains JSX, which Node's built-in TS
// type-stripping cannot parse/import directly, so the handler lives in a
// plain .ts sibling module (processSubmitClickLogic.ts) that the component
// imports. This mirrors how other pure logic in this folder (e.g.
// reportEditWindow.ts, processDeductionLogic.ts) is already tested.
const logicModulePath = pathToFileURL(
  path.join(root, 'src/pages/worker/processSubmitClickLogic.ts')
).href;
const loadLogic = () => import(logicModulePath);

test('one click submits immediately when not already submitting (no second confirmation gate)', async () => {
  const { handleProcessSubmitClick } = await loadLogic();
  let calls = 0;
  handleProcessSubmitClick(false, () => { calls += 1; });
  assert.equal(calls, 1, 'onSubmit must be called exactly once, synchronously, on a single click');
});

test('the in-flight submit lock prevents a duplicate call while a submit is already running', async () => {
  const { handleProcessSubmitClick } = await loadLogic();
  let calls = 0;
  handleProcessSubmitClick(true, () => { calls += 1; });
  assert.equal(calls, 0, 'onSubmit must not be called again while submitting is true');
});

test('ProcessSubmitActions.tsx wires the button directly to the real click-handler module (no local re-implementation to drift out of sync)', () => {
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.match(actions, /import \{ handleProcessSubmitClick \} from "\.\.\/processSubmitClickLogic"/);
  assert.match(actions, /handleSubmitClick = \(\) => handleProcessSubmitClick\(submitting, onSubmit\)/);
  assert.match(actions, /onClick=\{handleSubmitClick\}/);
});

// --- Structural: things a plain Node test cannot execute (JSX markup,          ---
// --- a full page component with hooks/network/router deps) are still checked  ---
// --- for presence/absence, scoped as tightly as possible.                     ---

test('ProcessSubmitActions no longer renders a second "Xác nhận nộp" confirmation dialog', () => {
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.doesNotMatch(actions, /Xác nhận nộp báo cáo/);
  assert.doesNotMatch(actions, />Xác nhận nộp</);
  assert.doesNotMatch(actions, /dailyHoursPrompt/);
  assert.doesNotMatch(actions, /getMyDailyWorkingHours/);
  // guards against reintroducing an intermediate async gate before onSubmit
  assert.doesNotMatch(actions, /await[\s\S]{0,80}onSubmit\(\)/);
});

test('submit button disables while submitting and shows an in-flight label', () => {
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.match(actions, /worker-floating-save[\s\S]{0,200}disabled=\{loadingWorker \|\| submitting\}/);
  assert.match(actions, /submitting \? "Đang lưu\.\.\." : "Nộp dữ liệu"/);
});

test('duplicate-report confirmation dialog (a separate business rule, not a generic submit confirmation) is preserved', () => {
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  assert.match(actions, /Đã tồn tại báo cáo tương tự/);
  assert.match(actions, /onClick=\{onCreateDuplicate\}/);
  assert.match(actions, /onClick=\{onCancelDuplicate\}/);
  assert.match(actions, /onClick=\{handleContinueExisting\}/);
});

test('ProcessPage.handleSubmit still runs frontend validation before calling the backend create API in the same action', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const handlerStart = page.indexOf('const handleSubmit =');
  assert.ok(handlerStart >= 0);
  const handlerBody = page.slice(handlerStart, handlerStart + 4000);
  const validateIndex = handlerBody.indexOf('validateForm()');
  const createIndex = handlerBody.indexOf('createTempReport(payload)');
  assert.ok(validateIndex >= 0, 'handleSubmit must still call validateForm()');
  assert.ok(createIndex >= 0, 'handleSubmit must still call createTempReport(payload)');
  assert.ok(validateIndex < createIndex, 'validation must run before the report is sent to the backend');
});

test('a failed submit keeps the entered form data (no reset/draft-clear/navigate in the catch path)', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const handlerStart = page.indexOf('const handleSubmit =');
  const catchStart = page.indexOf('catch (error: unknown)', handlerStart);
  const catchEnd = page.indexOf('finally', catchStart);
  assert.ok(catchStart >= 0 && catchEnd > catchStart);
  const catchBody = page.slice(catchStart, catchEnd);
  assert.doesNotMatch(catchBody, /clearProcessDraft/);
  assert.doesNotMatch(catchBody, /navigate\(/);
  assert.match(catchBody, /showToast\(/);
});

test('submitLockRef still guards against duplicate submits from rapid repeat clicks', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const handlerStart = page.indexOf('const handleSubmit =');
  const handlerBody = page.slice(handlerStart, handlerStart + 2000);
  assert.match(handlerBody, /if \(submitLockRef\.current\) return;/);
  assert.match(handlerBody, /submitLockRef\.current = true;/);
  assert.match(handlerBody, /setSubmitting\(true\);/);
});

test('duplicate confirmation signature covers the full worker form snapshot, including machine lines and deductions', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const signatureStart = page.indexOf('const getDuplicateFormSignature');
  const signatureEnd = page.indexOf('const finishDuplicateAction', signatureStart);
  assert.ok(signatureStart >= 0 && signatureEnd > signatureStart, 'duplicate signature helper must exist');
  const signature = page.slice(signatureStart, signatureEnd);
  for (const field of [
    'form,', 'extraData,', 'operationType,', 'isCvkMode,', 'cutExecutionMode,',
    'operationMode,', 'machineLines,', 'machineCount,', 'deductions,',
    'selectedDeduction,', 'selectedNg,',
  ]) {
    assert.ok(signature.includes(field), `duplicate signature must include ${field}`);
  }
  assert.match(signature, /\[\s*processInfo\.id[\s\S]*selectedNg[\s\S]*\]/);
  assert.doesNotMatch(signature, /resolvedReportKqdPolicy/);
});

test('successful duplicate creation/update clears the draft and invalidates pending autosave', () => {
  const page = read('src/pages/worker/ProcessPage.tsx');
  const start = page.indexOf('const finishDuplicateAction = useCallback(');
  const end = page.indexOf('const handleCreateDuplicateAnyway', start);
  assert.ok(start >= 0 && end > start);
  const finish = page.slice(start, end);
  assert.match(finish, /resetVersionRef\.current \+= 1/);
  assert.match(finish, /clearTimeout\(draftSaveTimerRef\.current\)/);
  assert.match(finish, /clearProcessDraft\(process\)/);
  assert.ok(finish.indexOf('clearProcessDraft(process)') < finish.indexOf('navigate("/worker"'));
  assert.match(finish, /\[navigate, process, setDuplicatePrompt\]/);
  const create = page.slice(end, page.indexOf('const handleUpdateExistingReport', end));
  const update = page.slice(page.indexOf('const handleUpdateExistingReport', end), page.indexOf('// Separate-run duplicate creation', end));
  assert.match(create, /showToast\([\s\S]*?finishDuplicateAction\(\)/);
  assert.match(update, /showToast\([\s\S]*?finishDuplicateAction\(\)/);
  assert.doesNotMatch(create.slice(create.indexOf('catch (error: unknown)')), /clearProcessDraft\(process\)/);
  assert.doesNotMatch(update.slice(update.indexOf('catch (error: unknown)')), /clearProcessDraft\(process\)/);
});

test('duplicate resume only updates drafts explicitly owned by the signed-in worker', () => {
  const actions = read('src/pages/worker/components/ProcessSubmitActions.tsx');
  const start = actions.indexOf('const syncVisibleMachineLinesToDraft');
  const end = actions.indexOf('export default function ProcessSubmitActions', start);
  assert.ok(start >= 0 && end > start);
  const body = actions.slice(start, end);
  assert.match(actions, /import \{ getStoredUser \} from "\.\.\/\.\.\/\.\.\/utils\/authStorage"/);
  assert.match(body, /if \(!user \|\| user\.role !== "worker"\) return/);
  assert.match(body, /draft\?\.ownerWorkerId == null && !draft\?\.ownerWorkerCode/);
  assert.match(body, /Number\(draft\.ownerWorkerId\) !== workerId/);
  assert.match(body, /String\(draft\.ownerWorkerCode \|\| ""\)\.trim\(\)\.toUpperCase\(\) !== workerCode/);
  assert.ok(body.indexOf('ownerWorkerId == null') < body.indexOf('bestDraft = draft'));
});
