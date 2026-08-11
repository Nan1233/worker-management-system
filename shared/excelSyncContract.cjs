'use strict';

// KTC Excel <-> DB contract.
const EXCEL_SYNC_CONTRACT_VERSION = '2026-08-11.1';
// Chỉ dữ liệu đầu vào nghiệp vụ mà người dùng có thể chỉnh trong form mới được phép đi từ Excel về DB.
// Mọi trường dẫn xuất/hệ thống phải được backend tính hoặc quản lý.
const EXCEL_MUTABLE_FIELDS = Object.freeze([
  'work_date',
  'shift',
  'operation_type',
  'operation_mode',
  'machine_no',
  'product_name',
  'training_percent',
  'actual_time',
  'tt_ok',
  'deductions',
  'defects',
  'note'
]);

const EXCEL_SYSTEM_FIELDS = Object.freeze([
  'id',
  'worker_id',
  'process_id',
  'total_time',
  'deduction_time',
  'standard_output',
  'actual_output',
  'tt_ng',
  'output_per_hour',
  'achievement_rate',
  'ng_rate',
  'status',
  'reviewed_by',
  'approved_at',
  'updated_at',
  'version'
]);

const mutableSet = new Set(EXCEL_MUTABLE_FIELDS);

function isExcelMutableField(field) {
  return mutableSet.has(String(field || ''));
}

function sanitizeExcelPatch(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(Object.entries(input).filter(([key]) => mutableSet.has(key)));
}

module.exports = {
  EXCEL_SYNC_CONTRACT_VERSION,
  EXCEL_MUTABLE_FIELDS,
  EXCEL_SYSTEM_FIELDS,
  isExcelMutableField,
  sanitizeExcelPatch
};
