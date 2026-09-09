'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const productionDetail = read('frontend/src/pages/worker/ProductionDetail.tsx');
const workerEdit = read('frontend/src/pages/worker/WorkerReportEdit.tsx');
const nonProductCreate = read('backend/models/nonProductWorkCreateModel.js');
const duplicateService = read('backend/services/logicalDuplicateReportService.js');
const managerDetail = read('frontend/src/pages/manager/ReportDetail.tsx');
const excelExport = read('backend/services/processExcelExportService.js');
const productRules = read('frontend/src/pages/worker/productSuggestionRules.ts');


test('worker report edit is limited to 10 minutes and pending/need_fix states', () => {
  assert.match(productionDetail, /const WORKER_EDIT_WINDOW_MS = 10 \* 60 \* 1000/);
  assert.match(productionDetail, /const isPending = report\.status === "pending" \|\| report\.status === "need_fix"/);
  assert.match(productionDetail, /const canEdit = isPending && remainingMs > 0/);

  assert.match(workerEdit, /created \+ 600000 - Date\.now\(\)/);
  assert.match(workerEdit, /if \(!report \|\| remaining <= 0\) return;/);
});

test('manager can edit pending reports through the central permission model', () => {
  assert.match(managerDetail, /source === "pending" \? can\("REPORT_PENDING_EDIT"\) : can\("REPORT_APPROVED_EDIT"\)/);
});

test('GC product suggestions keep machine suffix rules scoped to Cắt only', () => {
  assert.match(productRules, /const isCutProduct = normalizeWorkType\(product\.work_type\) === "CUT"/);
  assert.match(productRules, /if \(useEncodedMachineSuffix && isCutProduct\)/);
  assert.match(productRules, /must remain selectable in all Lồng modes/);
});

test('Công việc khác uses one Xuất nhập work type and remains product-less', () => {
  assert.match(nonProductCreate, /const PROCESS_CODE = "CVK"/);
  assert.match(nonProductCreate, /"XUẤT NHẬP"/);
  assert.match(nonProductCreate, /data\.product_name = null/);
  assert.match(nonProductCreate, /data\.standard_output = 0/);
  assert.match(nonProductCreate, /data\.actual_output = 0/);
  assert.match(nonProductCreate, /data\.operation_mode = "MANUAL"/);
  assert.match(nonProductCreate, /work_type: workType/);
});

test('Xuất/Nhập aliases normalize to the same duplicate-detection work type', () => {
  assert.match(duplicateService, /raw === 'XUẤT' \|\| raw === 'XUAT' \|\| raw === 'NHẬP' \|\| raw === 'NHAP'/);
  assert.match(duplicateService, /raw === 'XUẤT\/NHẬP' \|\| raw === 'XUAT\/NHAP'/);
  assert.match(duplicateService, /return 'XUẤT NHẬP'/);
});

test('Excel export reads canonical report data rather than relying on stale UI fields', () => {
  assert.match(excelExport, /pr\.work_date/);
  assert.match(excelExport, /pr\.shift/);
  assert.match(excelExport, /pr\.operation_type/);
  assert.match(excelExport, /pr\.process_id/);
});
