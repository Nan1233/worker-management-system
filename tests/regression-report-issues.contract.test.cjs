'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const productionDetail = read('frontend/src/pages/worker/ProductionDetail.tsx');
const workerEdit = read('frontend/src/pages/worker/WorkerReportEdit.tsx');
const reportValidation = read('backend/utils/reportValidation.js');
const nonProductCreate = read('backend/models/nonProductWorkCreateModel.js');
const duplicateService = read('backend/services/logicalDuplicateReportService.js');
const productionController = read('backend/controllers/productionTempWorkerController.js');
const productionCreate = read('backend/models/productionTempCreateModel.js');
const managerDetail = read('frontend/src/pages/manager/ReportDetail.tsx');
const approvalModel = read('backend/models/productionTempApprovalModel.js');
const excelExport = read('backend/services/processExcelExportService.js');
const productRules = read('frontend/src/pages/worker/productSuggestionRules.ts');
const machineRules = read('backend/services/factoryMachineRuleService.js');


test('worker report edit is limited to 10 minutes and pending/need_fix states', () => {
  assert.match(productionDetail, /const WORKER_EDIT_WINDOW_MS = 10 \\* 60 \\* 1000/);
  assert.match(productionDetail, /const isPending = report\\.status === "pending" \\|\\| report\\.status === "need_fix"/);
  assert.match(productionDetail, /const canEdit = isPending && remainingMs > 0/);

  assert.match(workerEdit, /created \\+ 600000 - Date\\.now\\(\\)/);
  assert.match(workerEdit, /if \\(!report \\|\\| remaining <= 0\\) return;/);
});

test('manager can edit pending reports through the central permission model', () => {
  assert.match(managerDetail, /source === "pending" \\? can\\("REPORT_PENDING_EDIT"\\) : can\\("REPORT_APPROVED_EDIT"\\)/);
});

test('GC product suggestions keep machine suffix rules scoped to Cắt only', () => {
  assert.match(productRules, /const isCutProduct = normalizeWorkType\\(product\\.work_type\\) === "CUT"/);
  assert.match(productRules, /if \\(useEncodedMachineSuffix && isCutProduct\\)/);
  assert.match(productRules, /must remain selectable in all Lồng modes/);
});

test('Công việc khác uses one Xuất nhập work type and remains product-less', () => {
  assert.match(nonProductCreate, /const PROCESS_CODE = "CVK"/);
  assert.match(nonProductCreate, /"XUẤT NHẬP"/);
  assert.match(nonProductCreate, /data\\.product_name = null/);
  assert.match(nonProductCreate, /data\\.standard_output = 0/);
  assert.match(nonProductCreate, /data\\.actual_output = 0/);
  assert.match(nonProductCreate, /data\\.operation_mode = "MANUAL"/);
  assert.match(nonProductCreate, /work_type: workType/);
});

test('Xuất/Nhập aliases normalize to the same duplicate-detection work type', () => {
  assert.match(duplicateService, /raw === 'XUẤT' \\|\\| raw === 'XUAT' \\|\\| raw === 'NHẬP' \\|\\| raw === 'NHAP'/);
  assert.ok(duplicateService.includes("raw === 'XUẤT/NHẬP' || raw === 'XUAT/NHAP'"));
  assert.match(duplicateService, /return 'XUẤT NHẬP'/);
});

test('Excel export reads canonical report data rather than relying on stale UI fields', () => {
  assert.match(excelExport, /pr\\.work_date/);
  assert.match(excelExport, /pr\\.shift/);
  assert.match(excelExport, /pr\\.operation_type/);
  assert.match(excelExport, /pr\\.process_id/);
});

// Negative/boundary contracts: these cases are intentionally invalid and must be rejected.
test('negative cases: report validator rejects future dates, >14-day backdate, and >12h total time', () => {
  assert.match(reportValidation, /MAX_TOTAL_TIME_HOURS = 12/);
  assert.match(reportValidation, /maxBackDays \\?\\? 14/);
  assert.match(reportValidation, /parsedDate > today/);
  assert.match(reportValidation, /parsedDate < oldest/);
  assert.match(reportValidation, /totalTime > MAX_TOTAL_TIME_HOURS/);
  assert.match(reportValidation, /totalTime - \\(actualTime \+ deductionTime\\)/);
});

test('negative cases: worker submission requires request id and duplicate confirmation', () => {
  assert.match(productionController, /CLIENT_REQUEST_ID_REQUIRED/);
  assert.match(productionController, /DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.match(productionController, /duplicate_confirmation_token/);
  assert.match(productionController, /client_request_id/);
  assert.match(productionCreate, /lockClientRequestId/);
  assert.match(productionCreate, /findByClientRequest/);
  assert.match(productionCreate, /verifyDuplicateConfirmation/);
});

test('negative cases: approval is process-scoped and protected by row lock/concurrency checks', () => {
  assert.match(approvalModel, /JOIN manager_processes mp ON mp\\.process_id = temp\\.process_id/);
  assert.match(approvalModel, /mp\\.manager_id = \\?/);
  assert.match(approvalModel, /FOR UPDATE/);
  assert.match(approvalModel, /TEMP_REPORT_VERSION_CONFLICT/);
});

test('negative cases: shared GC machines enforce four-worker capacity and preserve physical event identity', () => {
  assert.match(machineRules, /GC_SHARED_MACHINE_NUMBERS/);
  assert.match(machineRules, /DEFAULT_SHARED_WORKERS_PER_MACHINE = 4/);
  assert.match(productionCreate, /const requestedEventId = line\\.machine_event_id \\|\\| null/);
  assert.match(productionCreate, /const normalizedRequestedEventId = Number\\(requestedEventId\\)/);
});

test('negative cases: Lồng must not inherit Cắt machine-suffix filtering; 2801-LT remains eligible', () => {
  assert.match(productRules, /isCutProduct/);
  assert.match(productRules, /useEncodedMachineSuffix && isCutProduct/);
  assert.match(productRules, /must remain selectable in all Lồng modes/);
});
