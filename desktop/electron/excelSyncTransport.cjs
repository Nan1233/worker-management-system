'use strict';
const crypto = require('node:crypto');

// Same workbook change retains this identity across restarts and HTTP retries.
// A fresh workbook export receives a different generatedAt identifier.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function operationIdForChange(change, workbookIdentity = null) {
  const action = change?.create === true
    ? { create: true, row: change.row, data: change.data, invalid: Boolean(change.invalid), source: change.source || null }
    : { id: change.id, expected_updated_at: change.expected_updated_at, patch: change.patch, source: change.source || null };
  return crypto.createHash('sha256').update(JSON.stringify(stable({ action, workbookIdentity }))).digest('hex');
}

function createExcelSyncTransport({authenticatedFetch, API_BASE_URL}) {
async function postExcelChanges(changes) {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 200) throw new Error('Số thay đổi Excel không hợp lệ');
  const withIds = changes.map((change) => ({
    ...change, operation_id: change.operation_id || operationIdForChange(change)
  }));
  if (new Set(withIds.map(change => change.operation_id)).size !== withIds.length) throw new Error('Trùng mã thao tác Excel');
  const response = await authenticatedFetch(`${API_BASE_URL}/production/excel-sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changes: withIds })
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('Tài khoản hiện tại không có quyền đồng bộ chỉnh sửa Excel về DB.');
    error.code = 'EXCEL_DB_SYNC_FORBIDDEN';
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (![200, 207].includes(response.status)) throw new Error(payload.message || `Đồng bộ Excel về DB lỗi HTTP ${response.status}`);
  // Validate every acknowledgment here, including requests sent from the
  // manual import screen. Never rebuild an Excel file on an ambiguous response.
  const validCounts = [payload.total, payload.succeeded, payload.failed].every(
    (value) => Number.isSafeInteger(value) && value >= 0
  );
  const expectedChanges = new Map(withIds.map((change) => [change.operation_id, change]));
  const expectedIds = new Set(expectedChanges.keys());
  const acknowledged = new Set();
  let successCount = 0;
  let failureCount = 0;
  let validRows = Array.isArray(payload.results) && payload.results.length === withIds.length;
  for (const item of (validRows ? payload.results : [])) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.operation_id !== 'string'
        || !expectedIds.has(item.operation_id) || acknowledged.has(item.operation_id)) {
      validRows = false;
      break;
    }
    acknowledged.add(item.operation_id);
    if (item.success === true) {
      if (!Number.isSafeInteger(Number(item.id)) || Number(item.id) <= 0
          || typeof item.updated_at !== 'string' || !Number.isFinite(Date.parse(item.updated_at))
          || (expectedChanges.get(item.operation_id).create !== true && Number(item.id) !== Number(expectedChanges.get(item.operation_id).id))
          || (expectedChanges.get(item.operation_id).create === true && item.create !== true)) {
        validRows = false;
        break;
      }
      successCount += 1;
    } else if (item.success === false) {
      failureCount += 1;
    } else {
      validRows = false;
      break;
    }
  }
  if (!validCounts || !validRows || acknowledged.size !== expectedIds.size
      || payload.total !== withIds.length || payload.succeeded !== successCount
      || payload.failed !== failureCount || (response.status === 200 && failureCount > 0)
      || payload.success !== (failureCount === 0)) {
    const error = new Error('Backend trả biên nhận Excel không đầy đủ hoặc mâu thuẫn; giữ nguyên file để thử lại.');
    error.code = 'EXCEL_DB_SYNC_UNVERIFIED_ACK';
    throw error;
  }
  return payload;
}


  return {postExcelChanges};
}
module.exports = {operationIdForChange, createExcelSyncTransport};
