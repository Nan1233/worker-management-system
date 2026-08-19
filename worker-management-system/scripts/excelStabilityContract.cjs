'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { EXCEL_SYNC_CONTRACT_VERSION, EXCEL_MUTABLE_FIELDS, EXCEL_SYSTEM_FIELDS } = require('../shared/excelSyncContract.cjs');

const root = path.resolve(__dirname, '..');
const monthlyPath = path.join(root, 'desktop/electron/monthlyWorkbookLocal.cjs');
const syncPath = path.join(root, 'desktop/electron/excelDbSync.cjs');
const controllerPath = path.join(root, 'backend/controllers/excelEditSyncController.js');
const monthly = fs.readFileSync(monthlyPath, 'utf8');
const sync = fs.readFileSync(syncPath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');

assert.match(EXCEL_SYNC_CONTRACT_VERSION, /^\d{4}-\d{2}-\d{2}\.\d+$/, 'Excel contract phải có version rõ ràng');
assert.ok(EXCEL_MUTABLE_FIELDS.includes('tt_ok'), 'Excel contract phải cho phép sửa SL OK');
assert.ok(EXCEL_MUTABLE_FIELDS.includes('actual_time'), 'Excel contract phải cho phép sửa TG thực tế');
assert.ok(EXCEL_MUTABLE_FIELDS.includes('deductions'), 'Excel contract phải cho phép sửa trừ giờ');
assert.ok(EXCEL_MUTABLE_FIELDS.includes('defects'), 'Excel contract phải cho phép sửa NG chi tiết');
for (const field of ['actual_output','standard_output','total_time','tt_ng','status','worker_id','process_id']) {
  assert.ok(!EXCEL_MUTABLE_FIELDS.includes(field), `${field} là dữ liệu hệ thống, không được cho Excel ghi trực tiếp`);
  assert.ok(EXCEL_SYSTEM_FIELDS.includes(field), `${field} phải nằm trong danh sách dữ liệu hệ thống`);
}

assert.match(controller, /sanitizeExcelPatch/, 'Backend phải dùng whitelist Excel dùng chung');
assert.match(sync, /isExcelMutableField/, 'Desktop preview phải dùng whitelist Excel dùng chung');
assert.match(monthly, /const COLORS = Object\.freeze\(/, 'Màu Excel phải được quản lý tập trung');
assert.doesNotMatch(monthly, /argb:\s*['"]FF[0-9A-Fa-f]{6}['"]/, 'Không được hard-code ARGB ngoài COLORS');
assert.match(monthly, /EXCEL_CONTRACT_VERSION/, 'Workbook phải có version contract rõ ràng trong source');
assert.match(monthly, /TAY MÁY CẮT LỒNG/, 'GC helper sheet phải tồn tại');

console.log(`[KTC] Excel stability contract OK (${EXCEL_MUTABLE_FIELDS.length} mutable fields)`);
