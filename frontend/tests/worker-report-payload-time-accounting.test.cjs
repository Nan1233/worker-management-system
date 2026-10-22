'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const ts = require('typescript');
const Module = require('node:module');

const root = path.join(__dirname, '..');
const submissionPath = path.join(root, 'src/pages/worker/processReportSubmission.ts');

function loadSubmissionModule() {
  const source = fs.readFileSync(submissionPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const compiledModule = new Module(submissionPath, module);
  compiledModule.filename = submissionPath;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(submissionPath));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === submissionPath && request === './productSuggestionRules') {
      return {
        getFullProductCode: (alias) => alias,
        isNoStandardLongWork: () => false
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    compiledModule._compile(compiled, submissionPath);
  } finally {
    Module._load = originalLoad;
  }
  return compiledModule.exports;
}

async function makePayload(processCode) {
  const { buildProductionReportPayload } = loadSubmissionModule();
  return buildProductionReportPayload({
    clientRequestId: 'test-request-001',
    processId: processCode === 'GC' ? 1 : 2,
    processCode,
    form: {
      workDate: '2026-10-14',
      shift: 'A',
      workerCode: 'W001',
      workerName: 'Test Worker',
      trainingPercent: '100',
      machineNo: 'M1',
      totalTime: '9',
      actualTime: '8',
      actualHours: '8',
      actualMinutes: '0',
      deductionTime: '1',
      productName: 'P1',
      standardOutput: '100',
      actualOutput: '12',
      ttOk: '10',
      ttNg: '2',
      kqdDapLai: '',
      kqdTuot: '',
      voDoLong: '',
      xuocDoLong: '',
      congGay: '',
      xoay: '',
      khongDut: '',
      baviaHut: '',
      ppcm: '',
      loiCaoSu: '',
      ngKichThuoc: '',
      catLem: '',
      note: '',
      executionMethod: 'MACHINE',
      adjustmentCount: '0',
      workType: '',
      k1DeductionWork: '',
    },
    extraData: {},
    operationType: 'CUT',
    isCutLongProcess: processCode === 'GC',
    isCvkMode: false,
    usesAnyMachine: true,
    usesMultiMachineLines: true,
    usesSingleMachine: false,
    machineLines: [{
      machineCode: 'M1',
      productCode: 'P1',
      hours: '8',
      minutes: '0',
      adjustmentMinutes: '0',
      adjustmentCount: '0',
      deductions: { matDien: '60' },
      selectedDeductions: ['matDien'],
      okQuantity: '10',
      ngQuantity: '2',
      standardOutputPerHour: 100,
      standardTimeSeconds: null,
      standardSource: 'DEFAULT',
      standardLoading: false,
      standardError: '',
      selectedDefects: [],
      defects: {},
    }],
    machineOptions: [],
    productOptions: [],
    activeNgOptions: [],
    deductions: { matDien: '60' },
    activeDeductionOptions: [{ key: 'matDien', id: 1, code: 'MAT_DIEN', label: 'Mất điện' }],
    excludeKqdFromTt: false,
  });
}

test('non-GC machine-line payload preserves worker actual/gross/deduction time for daily-hours accounting', async () => {
  const payload = await makePayload('MAI');
  assert.equal(payload.actual_time, 8, 'worker actual time must remain on the parent report');
  assert.equal(payload.deduction_time, 1, 'deduction time must remain on the parent report');
  assert.equal(payload.total_time, 9, 'gross report time must remain actual plus deduction');
  assert.equal(payload.actual_output, 0, 'machine-line output must not be double-counted on the parent');
  assert.equal(payload.tt_ok, 0, 'machine-line OK must not be double-counted on the parent');
  assert.equal(payload.tt_ng, 0, 'machine-line NG must not be double-counted on the parent');
  assert.equal(payload.machine_lines[0].actual_time_hours, 8);
  assert.equal(payload.machine_lines[0].machine_time_hours, 9);
});

test('GC machine-line payload preserves its established per-machine-only time contract', async () => {
  const payload = await makePayload('GC');
  assert.equal(payload.actual_time, 0);
  assert.equal(payload.deduction_time, 0);
  assert.equal(payload.total_time, 0);
  assert.equal(payload.machine_lines[0].actual_time_hours, 8);
  assert.equal(payload.machine_lines[0].machine_time_hours, 9);
});
