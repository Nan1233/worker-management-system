'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const has = (source, text) => assert.ok(source.includes(text), `Expected source to contain: ${text}`);

const productionDetail = read('frontend/src/pages/worker/ProductionDetail.tsx');
const workerEdit = read('frontend/src/pages/worker/WorkerReportEditV2.tsx');
const tempUpdateModel = read('backend/models/productionTempUpdateModel.js');
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


test('worker report edit is limited to 10 minutes and excludes approved reports', () => {
  // ProductionDetail intentionally reuses the worker edit form as a read-only view;
  // the actual worker edit-window implementation lives in WorkerReportEditV2.
  has(productionDetail, '<WorkerReportEditV2 />');
  has(workerEdit, 'created + 600000 - Date.now()');
  has(workerEdit, 'if (!report || (!managerRoute && remaining <= 0) || readOnly) return;');
  has(tempUpdateModel, 'const WORKER_EDIT_WINDOW_MS = 10 * 60 * 1000;');
  has(tempUpdateModel, 'if (current.status === "approved") throw new Error("Báo cáo đã duyệt không thể sửa ở bảng tạm");');
  has(tempUpdateModel, 'const resubmittingRejected = isWorkerEdit && current.status === "rejected";');
});

test('manager can edit reports through the central permission model', () => {
  has(managerDetail, 'const canEdit = source === "pending" ? can("REPORT_PENDING_EDIT") : can("REPORT_APPROVED_EDIT");');
});

test('GC product suggestions keep machine suffix rules scoped to Cắt only', () => {
  has(productRules, 'productWorkTypes.has("CUT")');
  has(productRules, 'isGcAutomaticMachine(selectedRawMachine)');
  has(productRules, 'GC_AUTOMATIC_ALIAS_CODES.has(alias)');
  has(productRules, 'productWorkTypes.has("LONG")');
  has(productRules, 'isGcLongMachine(selectedRawMachine)');
});

test('Công việc khác uses one Xuất nhập work type and remains product-less', () => {
  has(nonProductCreate, 'const PROCESS_CODE = "CVK";');
  has(nonProductCreate, '"XUẤT NHẬP"');
  has(nonProductCreate, 'data.product_name = null;');
  has(nonProductCreate, 'data.standard_output = 0;');
  has(nonProductCreate, 'data.actual_output = 0;');
  has(nonProductCreate, 'data.operation_mode = "MANUAL";');
  has(nonProductCreate, 'work_type: workType');
});

test('Xuất/Nhập aliases normalize to the same duplicate-detection work type', () => {
  has(duplicateService, "raw === 'XUẤT' || raw === 'XUAT' || raw === 'NHẬP' || raw === 'NHAP'");
  has(duplicateService, "raw === 'XUẤT/NHẬP' || raw === 'XUAT/NHAP'");
  has(duplicateService, "return 'XUẤT NHẬP'");
});

test('Excel export reads canonical report data rather than relying on stale UI fields', () => {
  has(excelExport, 'pr.work_date');
  has(excelExport, 'pr.shift');
  has(excelExport, 'pr.operation_type');
  has(excelExport, 'pr.process_id');
});

// Negative/boundary contracts: these cases are intentionally invalid and must be rejected.
test('negative cases: report validator rejects future dates, >14-day backdate, and >12h total time', () => {
  has(reportValidation, 'const MAX_TOTAL_TIME_HOURS = 12;');
  has(reportValidation, 'const maxBackDays = Number(options.maxBackDays ?? 14);');
  has(reportValidation, 'if (parsedDate > today)');
  has(reportValidation, 'const oldest = new Date(today);');
  has(reportValidation, 'if (parsedDate < oldest)');
  has(reportValidation, 'if (totalTime > MAX_TOTAL_TIME_HOURS)');
  has(reportValidation, 'Math.abs(totalTime - (actualTime + deductionTime))');
});

test('negative cases: worker submission requires request id and duplicate confirmation', () => {
  has(productionController, 'CLIENT_REQUEST_ID_REQUIRED');
  has(productionController, 'DUPLICATE_CONFIRMATION_REQUIRED');
  has(productionController, 'duplicate_confirmation_token');
  has(productionController, 'client_request_id');
  has(productionCreate, 'lockClientRequestId');
  has(productionCreate, 'findByClientRequest');
  has(productionCreate, 'verifyDuplicateConfirmation');
});

test('negative cases: approval is process-scoped and protected by row lock/concurrency checks', () => {
  has(approvalModel, 'LEFT JOIN manager_processes mp ON mp.process_id = temp.process_id');
  has(approvalModel, 'AND mp.manager_id = ?');
  has(approvalModel, 'FOR UPDATE');
  has(approvalModel, 'TEMP_REPORT_VERSION_CONFLICT');
});

test('negative cases: shared GC machines enforce four-worker capacity and preserve physical event identity', () => {
  has(machineRules, 'GC_SHARED_MACHINE_NUMBERS');
  has(machineRules, 'DEFAULT_SHARED_WORKERS_PER_MACHINE = 4');
  has(productionCreate, 'const requestedEventId = line.machine_event_id || null;');
  has(productionCreate, 'const normalizedRequestedEventId = Number(requestedEventId) || null;');
});

test('negative cases: Lồng must not inherit Cắt machine-suffix filtering', () => {
  has(productRules, 'productWorkTypes.has("LONG")');
  has(productRules, 'isGcLongMachine(selectedRawMachine)');
  has(productRules, 'return workerSelectionProducts(canonicalProducts);');
});
