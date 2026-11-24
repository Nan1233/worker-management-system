'use strict';
const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
function publicError(status, code, message) {
  return Object.assign(new Error(message), { status, code, isPublic: true });
}
function makeExcelSyncReceipt({ actorId, operationKey, canonicalChange }) {
  const actor = Number(actorId);
  if (!Number.isSafeInteger(actor) || actor <= 0) {
    throw publicError(403, 'EXCEL_SYNC_ACTOR_REQUIRED', 'Không xác định được người đồng bộ Excel');
  }
  if (typeof operationKey !== 'string' || !/^[a-f0-9]{64}$/i.test(operationKey)) {
    throw publicError(422, 'EXCEL_SYNC_OPERATION_ID_REQUIRED', 'Thao tác đồng bộ thiếu mã nhận diện hợp lệ');
  }
  const key = operationKey.toLowerCase();
  const requestHash = sha(canonicalChange);
  return {
    async acquire(conn) {
      // The receipt uses the same DB transaction as the actual report write.
      // A lost response can be replayed without updating the report twice.
      await conn.query(
        'INSERT INTO excel_sync_operation_receipts (idempotency_key,actor_id,request_sha256) VALUES (?,?,?) ON DUPLICATE KEY UPDATE idempotency_key=idempotency_key',
        [key, actor, requestHash]
      );
      const [rows] = await conn.query(
        'SELECT actor_id,request_sha256,result_json FROM excel_sync_operation_receipts WHERE idempotency_key=? FOR UPDATE',
        [key]
      );
      const row = rows[0];
      if (!row || Number(row.actor_id) !== actor || String(row.request_sha256) !== requestHash) {
        throw publicError(409, 'EXCEL_SYNC_OPERATION_REUSED', 'Operation ID đã được dùng cho dữ liệu hoặc tài khoản khác');
      }
      if (row.result_json !== null && row.result_json !== undefined) {
        const stored = typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json;
        if (!stored || stored.success !== true || !Number.isSafeInteger(Number(stored.id)) || Number(stored.id) <= 0 || typeof stored.updated_at !== 'string' || !Number.isFinite(Date.parse(stored.updated_at))) {
          throw publicError(409, 'EXCEL_SYNC_RECEIPT_INVALID', 'Biên nhận đồng bộ không hợp lệ');
        }
        return stored;
      }
      return null;
    },
    async complete(conn, result) {
      if (result?.success !== true || !Number.isSafeInteger(Number(result.id)) || Number(result.id) <= 0 || !result.updated_at || !Number.isFinite(new Date(result.updated_at).getTime())) {
        throw publicError(500, 'EXCEL_SYNC_RESULT_INVALID', 'Không thể lưu biên nhận đồng bộ không hợp lệ');
      }
      const [written] = await conn.query(
        'UPDATE excel_sync_operation_receipts SET result_json=?,completed_at=NOW(6) WHERE idempotency_key=? AND actor_id=? AND result_json IS NULL',
        [JSON.stringify(result), key, actor]
      );
      if (Number(written.affectedRows) !== 1) {
        throw publicError(409, 'EXCEL_SYNC_RECEIPT_CONFLICT', 'Biên nhận đồng bộ đã bị thay đổi đồng thời');
      }
    }
  };
}
module.exports = { makeExcelSyncReceipt };
